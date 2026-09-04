import { execFile, spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const BROWSER_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];
const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
]);
const ALLOWED_CSP = "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'none'; base-uri 'none'; object-src 'none'";
const BLOCKED_CSP = "default-src 'none'; script-src 'self'; worker-src 'none'; connect-src 'none'; base-uri 'none'; object-src 'none'";

async function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through fixed local browser locations.
    }
  }
  throw new Error("No supported local CSP browser was found.");
}

async function buildSite(siteRoot) {
  for (const [entryPoint, outfile] of [
    ["test/browser-csp-allowed-entry.mjs", "allowed.js"],
    ["test/browser-csp-blocked-entry.mjs", "blocked.js"],
  ]) {
    await build({
      bundle: true,
      entryPoints: [resolve(ROOT, entryPoint)],
      format: "esm",
      legalComments: "none",
      minify: true,
      outfile: resolve(siteRoot, outfile),
      platform: "browser",
      target: "es2022",
    });
  }
  await build({
    bundle: true,
    format: "esm",
    legalComments: "none",
    minify: true,
    outfile: resolve(siteRoot, "o200k_base.worker.js"),
    platform: "browser",
    stdin: {
      contents: [
        'import { installBrowserWorkerGuards } from "./test/browser-worker-guard.mjs";',
        "installBrowserWorkerGuards();",
        'await import("./dist/workers/o200k_base.worker.js");',
      ].join("\n"),
      loader: "js",
      resolveDir: ROOT,
      sourcefile: "o200k_base.csp-worker.mjs",
    },
    target: "es2022",
  });
}

async function runSuite(browser, siteRoot, suite) {
  let resolveOutcome;
  const outcome = new Promise((resolveValue) => { resolveOutcome = resolveValue; });
  const requests = [];
  const files = new Map([
    [`/${suite}.html`, resolve(ROOT, `test/browser-csp-${suite}.html`)],
    ["/allowed.js", resolve(siteRoot, "allowed.js")],
    ["/blocked.js", resolve(siteRoot, "blocked.js")],
    ["/o200k_base.worker.js", resolve(siteRoot, "o200k_base.worker.js")],
  ]);
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      requests.push(requestUrl.pathname);
      if (requestUrl.pathname === "/__csp_passed__") {
        response.writeHead(200);
        response.end("ok");
        resolveOutcome("passed");
        return;
      }
      if (requestUrl.pathname === "/__csp_failed__") {
        response.writeHead(200);
        response.end("failed");
        resolveOutcome("failed");
        return;
      }
      const filePath = files.get(requestUrl.pathname);
      if (filePath === undefined || !(await stat(filePath)).isFile()) {
        throw new Error("Unknown CSP fixture.");
      }
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-security-policy": suite === "allowed" ? ALLOWED_CSP : BLOCKED_CSP,
        "content-type": MIME_TYPES.get(extname(filePath)) ?? "application/octet-stream",
      });
      response.end(await readFile(filePath));
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  await new Promise((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("CSP server did not expose a local port.");
  }
  const profile = await mkdtemp(join(os.tmpdir(), `token-counter-csp-${suite}-`));
  const child = spawn(browser, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-domain-reliability",
    "--disable-extensions",
    "--disable-gpu",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-sandbox",
    `--user-data-dir=${profile}`,
    `http://127.0.0.1:${address.port}/${suite}.html`,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const closed = new Promise((resolveClosed, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`CSP browser exited with code ${code}: ${stderr}`));
      } else {
        resolveClosed("closed");
      }
    });
  });
  const exited = new Promise((resolveExited) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveExited();
    } else {
      child.once("exit", resolveExited);
    }
  });
  let timeoutId;
  try {
    const status = await Promise.race([
      outcome,
      closed,
      new Promise((resolveTimeout) => {
        timeoutId = setTimeout(() => resolveTimeout("timeout"), 60_000);
      }),
    ]);
    if (status !== "passed") throw new Error(`CSP ${suite} verification ${status}.`);
    if (suite === "blocked" && requests.includes("/o200k_base.worker.js")) {
      throw new Error("Blocked CSP fetched the worker asset.");
    }
    if (suite === "allowed" && !requests.includes("/o200k_base.worker.js")) {
      throw new Error("Allowed CSP did not fetch the local worker asset.");
    }
    return requests;
  } finally {
    clearTimeout(timeoutId);
    child.kill("SIGKILL");
    await exited;
    server.closeAllConnections();
    await new Promise((resolveClosed) => server.close(resolveClosed));
    await rm(profile, {
      force: true,
      recursive: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}

const siteRoot = await mkdtemp(join(os.tmpdir(), "token-counter-csp-site-"));
try {
  await buildSite(siteRoot);
  const browser = await findBrowser();
  const { stdout: version } = await execFileAsync(browser, ["--version"]);
  const allowedRequests = await runSuite(browser, siteRoot, "allowed");
  const blockedRequests = await runSuite(browser, siteRoot, "blocked");
  process.stdout.write(
    `browser-csp-ok engine=chromium version=${JSON.stringify(version.trim())} allowed_requests=${allowedRequests.length} blocked_requests=${blockedRequests.length}\n`,
  );
} finally {
  await rm(siteRoot, { force: true, recursive: true });
}
