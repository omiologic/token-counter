import { execFile, spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const ROOT = resolve(new URL("../..", import.meta.url).pathname);
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

function parseSizes() {
  const option = process.argv.find((argument) => argument.startsWith("--sizes="));
  const values = (option?.slice("--sizes=".length) ?? "1,5,20")
    .split(",")
    .map(Number);
  if (
    values.length === 0 ||
    values.some((value) => !Number.isSafeInteger(value) || value <= 0 || value > 20)
  ) {
    throw new Error("Stress sizes must be integer MiB values from 1 through 20.");
  }
  return [...new Set(values)];
}

async function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through fixed local browser locations.
    }
  }
  throw new Error("No supported local stress browser was found.");
}

async function listen(server) {
  await new Promise((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Stress server did not expose a local port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function buildSite(siteRoot) {
  for (const [entryPoint, outfile] of [
    ["test/evaluation/browser-worker-main.mjs", "main.js"],
    ["dist/workers/o200k_base.js", "worker-api.js"],
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
      sourcefile: "o200k_base.stress-worker.mjs",
    },
    target: "es2022",
  });
}

const sizesMib = parseSizes();
const repeatSizeMib = sizesMib.includes(1) ? 1 : sizesMib[0];
const siteRoot = await mkdtemp(join(os.tmpdir(), "token-counter-stress-site-"));
const profile = await mkdtemp(join(os.tmpdir(), "token-counter-stress-profile-"));
let server;
let child;

try {
  await buildSite(siteRoot);
  const browser = await findBrowser();
  const { stdout: browserVersion } = await execFileAsync(browser, ["--version"]);
  let checkpoint = false;
  const unexpectedRequests = [];
  let resolveResult;
  const result = new Promise((resolveValue) => {
    resolveResult = resolveValue;
  });
  const files = new Map([
    ["/", resolve(ROOT, "test/evaluation/stress.html")],
    ["/index.html", resolve(ROOT, "test/evaluation/stress.html")],
    ["/main.js", resolve(siteRoot, "main.js")],
    ["/worker-api.js", resolve(siteRoot, "worker-api.js")],
    ["/o200k_base.worker.js", resolve(siteRoot, "o200k_base.worker.js")],
  ]);
  server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname === "/__stress_settings__") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ repeat_size_mib: repeatSizeMib, sizes_mib: sizesMib }));
        return;
      }
      if (requestUrl.pathname === "/__stress_checkpoint__") {
        checkpoint = true;
        response.writeHead(200);
        response.end("ready");
        return;
      }
      if (requestUrl.pathname === "/__stress_result__") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const parsed = JSON.parse(body);
        response.writeHead(200);
        response.end("complete");
        resolveResult(parsed);
        return;
      }
      if (checkpoint) unexpectedRequests.push(requestUrl.pathname);
      const filePath = files.get(requestUrl.pathname);
      if (filePath === undefined || !(await stat(filePath)).isFile()) {
        throw new Error("Unknown stress fixture.");
      }
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": MIME_TYPES.get(extname(filePath)) ?? "application/octet-stream",
      });
      response.end(await readFile(filePath));
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  const origin = await listen(server);
  child = spawn(browser, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-domain-reliability",
    "--disable-extensions",
    "--disable-gpu",
    "--disable-sync",
    "--enable-precise-memory-info",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-sandbox",
    `--user-data-dir=${profile}`,
    `${origin}/index.html`,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const closed = new Promise((resolveClosed, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Stress browser exited with code ${code}: ${stderr}`));
      } else {
        resolveClosed({ failed: true });
      }
    });
  });
  let timeoutId;
  const timeout = new Promise((resolveTimeout) => {
    timeoutId = setTimeout(() => resolveTimeout({ failed: true }), 900_000);
  });
  const browserResult = await Promise.race([result, closed, timeout]);
  clearTimeout(timeoutId);
  if (browserResult.failed || unexpectedRequests.length !== 0) {
    throw new Error("Stress qualification failed content-free.");
  }
  const output = {
    schema_version: 1,
    conditions: {
      arch: os.arch(),
      browser: browserVersion.trim(),
      cpu: os.cpus()[0]?.model ?? "unknown",
      node: process.version,
      platform: os.platform(),
      release: os.release(),
      total_memory_bytes: os.totalmem(),
    },
    methodology: {
      encoding: "o200k_base",
      heartbeat_interval_milliseconds: 5,
      input_recipes: ["repeated", "entropy-like"],
      network_and_persistence: "denied after explicit local module-worker initialization",
      repeated_measurement_size_mib: repeatSizeMib,
      sizes_mib: sizesMib,
    },
    cases: browserResult.cases,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  child?.kill("SIGKILL");
  server?.closeAllConnections();
  if (server) await new Promise((resolveClosed) => server.close(resolveClosed));
  await rm(siteRoot, { force: true, recursive: true });
  await rm(profile, { force: true, recursive: true });
}
