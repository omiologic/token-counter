import { spawn } from "node:child_process";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const BROWSER_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

async function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next fixed, non-configurable browser location.
    }
  }
  throw new Error("No supported local browser executable was found.");
}

async function runBrowser(browser, url, profile, outcome) {
  const args = [
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
    url,
  ];

  const child = spawn(browser, args, { stdio: ["ignore", "ignore", "pipe"] });
  const closed = new Promise((resolveClosed, reject) => {
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Browser exited with code ${code}: ${stderr}`));
        return;
      }
      resolveClosed();
    });
  });

  let timeout;
  try {
    const status = await Promise.race([
      outcome,
      closed.then(() => "closed"),
      new Promise((resolveTimeout) => {
        timeout = setTimeout(() => resolveTimeout("timeout"), 60_000);
      }),
    ]);
    if (status !== "passed") {
      throw new Error(`Browser parity verification ${status}.`);
    }
  } finally {
    clearTimeout(timeout);
    child.kill("SIGKILL");
    await Promise.race([
      closed.catch(() => undefined),
      new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
    ]);
  }
}

let resolveOutcome;
const outcome = new Promise((resolveResult) => {
  resolveOutcome = resolveResult;
});

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/__token_counter_browser_passed__") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("ok");
      resolveOutcome("passed");
      return;
    }
    if (pathname === "/__token_counter_browser_failed__") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("failed");
      resolveOutcome("failed");
      return;
    }
    const relativePath = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
    const filePath = resolve(ROOT, relativePath);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) {
      throw new Error("Path escaped the browser-test root.");
    }
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("Requested path is not a file.");
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": MIME_TYPES.get(extname(filePath)) ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  }
});

const profile = await mkdtemp(join(tmpdir(), "token-counter-browser-"));

try {
  const browser = await findBrowser();
  await new Promise((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Browser test server did not expose a local port.");
  }
  await runBrowser(
    browser,
    `http://127.0.0.1:${address.port}/test/browser-parity.html`,
    profile,
    outcome,
  );
  process.stdout.write("browser-parity-ok\n");
} finally {
  await new Promise((resolveClosed) => server.close(resolveClosed));
  await rm(profile, { recursive: true, force: true });
}
