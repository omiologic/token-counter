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

import {
  CDN_BASE_PATH,
  CDN_SURFACES,
  materializeCdnLayout,
} from "./cdn-layout.mjs";

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

function createFixtureServer(siteRoot) {
  const artifactCacheHeaders = new Map();
  const loadedSurfaces = new Set();
  const requestedArtifacts = new Set();
  const runtimeRequests = [];
  const waiters = new Map();

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const surface = requestUrl.searchParams.get("surface") ?? "missing";

    if (requestUrl.pathname === "/__token_counter_cdn_modules_loaded__") {
      loadedSurfaces.add(surface);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("loaded");
      return;
    }
    if (
      requestUrl.pathname === "/__token_counter_cdn_passed__" ||
      requestUrl.pathname === "/__token_counter_cdn_failed__"
    ) {
      const passed = requestUrl.pathname.endsWith("_passed__");
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      });
      response.end(passed ? `cdn-browser-ok ${surface}` : "cdn-browser-failed");
      waiters.get(surface)?.(passed ? "passed" : "failed");
      return;
    }

    try {
      const referer = request.headers.referer;
      if (referer !== undefined) {
        const referringSurface = new URL(referer).searchParams.get("surface");
        if (
          referringSurface !== null &&
          loadedSurfaces.has(referringSurface)
        ) {
          runtimeRequests.push(requestUrl.pathname);
        }
      }

      const relativePath = normalize(
        decodeURIComponent(requestUrl.pathname),
      ).replace(/^[/\\]+/, "");
      const filePath = resolve(siteRoot, relativePath);
      if (filePath !== siteRoot && !filePath.startsWith(`${siteRoot}${sep}`)) {
        throw new Error("Path escaped fixture root.");
      }
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        throw new Error("Requested path is not a file.");
      }
      const body = await readFile(filePath);
      const immutable = requestUrl.pathname.startsWith(`${CDN_BASE_PATH}/`);
      if (immutable) {
        requestedArtifacts.add(requestUrl.pathname);
        artifactCacheHeaders.set(
          requestUrl.pathname,
          "public, max-age=31536000, immutable",
        );
      }
      response.writeHead(200, {
        "cache-control": immutable
          ? "public, max-age=31536000, immutable"
          : "no-store",
        "content-type":
          MIME_TYPES.get(extname(filePath)) ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404, {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("not found");
    }
  });

  return {
    artifactCacheHeaders,
    loadedSurfaces,
    requestedArtifacts,
    runtimeRequests,
    server,
    waitFor(surface) {
      return new Promise((resolveOutcome) => {
        waiters.set(surface, resolveOutcome);
      });
    },
  };
}

async function listen(server) {
  await new Promise((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("CDN fixture server did not expose a local port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  await new Promise((resolveClosed) => server.close(resolveClosed));
}

async function runBrowser(browser, url, profile, outcome) {
  const child = spawn(
    browser,
    [
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
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
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
      throw new Error(`CDN browser verification ${status}.`);
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

const temporaryRoot = await mkdtemp(join(tmpdir(), "token-counter-cdn-browser-"));
let fixtureServer;

try {
  const { siteRoot } = await materializeCdnLayout(temporaryRoot);
  fixtureServer = createFixtureServer(siteRoot);
  const origin = await listen(fixtureServer.server);

  if (process.argv.includes("--serve")) {
    const surface = "./encodings/o200k_base";
    process.stdout.write(
      `${origin}/index.html?surface=${encodeURIComponent(surface)}\n`,
    );
    await new Promise((resolveShutdown) => {
      process.once("SIGINT", resolveShutdown);
      process.once("SIGTERM", resolveShutdown);
    });
  } else {
    const browser = await findBrowser();
    for (const { subpath } of CDN_SURFACES) {
      const profile = await mkdtemp(join(tmpdir(), "token-counter-cdn-profile-"));
      try {
        const outcome = fixtureServer.waitFor(subpath);
        const url = `${origin}/index.html?surface=${encodeURIComponent(subpath)}`;
        await runBrowser(browser, url, profile, outcome);
      } finally {
        await rm(profile, { force: true, recursive: true });
      }
    }

    if (fixtureServer.runtimeRequests.length !== 0) {
      throw new Error("CDN fixture made a request after its load checkpoint.");
    }
    for (const { artifact } of CDN_SURFACES) {
      const expectedPath = `${CDN_BASE_PATH}/${artifact}`;
      if (!fixtureServer.requestedArtifacts.has(expectedPath)) {
        throw new Error(`CDN artifact was not requested: ${expectedPath}`);
      }
      if (
        fixtureServer.artifactCacheHeaders.get(expectedPath) !==
        "public, max-age=31536000, immutable"
      ) {
        throw new Error(`CDN artifact was not served immutably: ${expectedPath}`);
      }
    }
    process.stdout.write("cdn-browser-ok\n");
  }
} finally {
  if (fixtureServer !== undefined) {
    await close(fixtureServer.server);
  }
  await rm(temporaryRoot, { force: true, recursive: true });
}
