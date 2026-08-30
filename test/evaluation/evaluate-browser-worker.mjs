import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const ROUNDS = 3;
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

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function summarize(samples) {
  const path = (selector) => samples.map(selector);
  return {
    initialization_milliseconds_median: {
      main: median(path((sample) => sample.initialization.main_milliseconds)),
      worker: median(path((sample) => sample.initialization.worker_milliseconds)),
    },
    memory: Object.fromEntries(
      Object.keys(samples[0].memory).map((key) => [
        key,
        typeof samples[0].memory[key] !== "number"
          ? samples[0].memory[key]
          : samples[0].memory[key] === null
          ? null
          : median(path((sample) => sample.memory[key])),
      ]),
    ),
    responsiveness_milliseconds_median: {
      main_count: median(
        path((sample) => sample.responsiveness.main.count_milliseconds_median),
      ),
      main_heartbeat_max_gap: median(
        path(
          (sample) => sample.responsiveness.main.heartbeat_max_gap_milliseconds,
        ),
      ),
      main_operation: median(
        path((sample) => sample.responsiveness.main.operation_milliseconds),
      ),
      worker_count: median(
        path((sample) => sample.responsiveness.worker.count_milliseconds_median),
      ),
      worker_heartbeat_max_gap: median(
        path(
          (sample) => sample.responsiveness.worker.heartbeat_max_gap_milliseconds,
        ),
      ),
      worker_operation: median(
        path((sample) => sample.responsiveness.worker.operation_milliseconds),
      ),
      worker_round_trip: median(
        path(
          (sample) => sample.responsiveness.worker.round_trip_milliseconds_median,
        ),
      ),
      worker_transfer_and_dispatch: median(
        path(
          (sample) =>
            sample.responsiveness.worker.transfer_and_dispatch_milliseconds_median,
        ),
      ),
    },
  };
}

async function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next fixed local browser path.
    }
  }
  throw new Error("No supported local browser executable was found.");
}

function createEvaluationServer(siteRoot) {
  let checkpoint = false;
  const requestsAfterCheckpoint = [];
  let resolveResult;
  const result = new Promise((resolveValue) => {
    resolveResult = resolveValue;
  });
  const files = new Map([
    ["/", resolve(ROOT, "test/evaluation/browser-worker-evaluation.html")],
    [
      "/index.html",
      resolve(ROOT, "test/evaluation/browser-worker-evaluation.html"),
    ],
    ["/main.js", resolve(siteRoot, "main.js")],
    ["/worker.js", resolve(siteRoot, "worker.js")],
    [
      "/fixtures/token-counts.json",
      resolve(ROOT, "test/fixtures/token-counts.json"),
    ],
  ]);

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname === "/__worker_evaluation_checkpoint__") {
        checkpoint = true;
        response.writeHead(200, { "cache-control": "no-store" });
        response.end("checkpoint");
        return;
      }
      if (requestUrl.pathname === "/__worker_evaluation_result__") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const parsed = JSON.parse(body);
        response.writeHead(200, { "cache-control": "no-store" });
        response.end("complete");
        resolveResult(parsed);
        return;
      }
      if (checkpoint) requestsAfterCheckpoint.push(requestUrl.pathname);
      const filePath = files.get(requestUrl.pathname);
      if (filePath === undefined) throw new Error("Unknown fixture path.");
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error("Fixture path was not a file.");
      const body = await readFile(filePath);
      const immutable = ["/main.js", "/worker.js"].includes(requestUrl.pathname);
      response.writeHead(200, {
        "cache-control": immutable
          ? "public, max-age=31536000, immutable"
          : "no-store",
        "cross-origin-embedder-policy": "require-corp",
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-resource-policy": "same-origin",
        "content-type": MIME_TYPES.get(extname(filePath)) ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "cache-control": "no-store" });
      response.end("not found");
    }
  });

  return { requestsAfterCheckpoint, result, server };
}

async function listen(server) {
  await new Promise((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Evaluation server did not expose a local port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function runBrowserSample(browser, siteRoot) {
  const fixtureServer = createEvaluationServer(siteRoot);
  const origin = await listen(fixtureServer.server);
  const profile = await mkdtemp(join(os.tmpdir(), "token-counter-worker-browser-"));
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
      "--enable-precise-memory-info",
      "--metrics-recording-only",
      "--no-first-run",
      "--no-sandbox",
      `--user-data-dir=${profile}`,
      `${origin}/index.html`,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const closed = new Promise((resolveClosed, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Browser exited with code ${code}: ${stderr}`));
        return;
      }
      resolveClosed("closed");
    });
  });

  let timeout;
  try {
    const outcome = await Promise.race([
      fixtureServer.result,
      closed,
      new Promise((resolveTimeout) => {
        timeout = setTimeout(() => resolveTimeout("timeout"), 120_000);
      }),
    ]);
    if (outcome === "closed" || outcome === "timeout" || outcome.failed) {
      throw new Error("Browser worker evaluation did not complete.");
    }
    if (fixtureServer.requestsAfterCheckpoint.length !== 0) {
      throw new Error("Browser requested an asset after initialization.");
    }
    return outcome;
  } finally {
    clearTimeout(timeout);
    child.kill("SIGKILL");
    await Promise.race([
      closed.catch(() => undefined),
      new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
    ]);
    await new Promise((resolveClosed) => fixtureServer.server.close(resolveClosed));
    await rm(profile, { force: true, recursive: true });
  }
}

async function payloadMeasurements(siteRoot) {
  const files = await Promise.all(
    ["main.js", "worker.js"].map(async (file) => {
      const contents = await readFile(resolve(siteRoot, file));
      const text = contents.toString("utf8");
      const forbiddenCapabilities =
        file === "main.js"
          ? ["fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "indexedDB"]
          : [];
      for (const forbidden of ["http://", "https://", ...forbiddenCapabilities]) {
        if (text.includes(forbidden)) {
          throw new Error(`Built artifact contains unexpected capability: ${forbidden}`);
        }
      }
      return {
        file,
        gzip_bytes: gzipSync(contents, { level: 9 }).byteLength,
        raw_bytes: contents.byteLength,
        sha384: `sha384-${createHash("sha384").update(contents).digest("base64")}`,
      };
    }),
  );
  return {
    combined_gzip_bytes: files.reduce((sum, file) => sum + file.gzip_bytes, 0),
    combined_raw_bytes: files.reduce((sum, file) => sum + file.raw_bytes, 0),
    duplicate_rank_payload: true,
    files,
  };
}

const temporaryRoot = await mkdtemp(join(os.tmpdir(), "token-counter-worker-evaluation-"));
try {
  for (const [entryPoint, outfile] of [
    ["test/evaluation/browser-worker-main.mjs", "main.js"],
    ["test/evaluation/browser-worker-runtime.mjs", "worker.js"],
  ]) {
    await build({
      bundle: true,
      entryPoints: [resolve(ROOT, entryPoint)],
      format: "esm",
      legalComments: "none",
      minify: true,
      outfile: resolve(temporaryRoot, outfile),
      platform: "browser",
      target: "es2022",
    });
  }

  const browser = await findBrowser();
  const { stdout: browserVersionOutput } = await execFileAsync(browser, ["--version"]);
  const samples = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    samples.push(await runBrowserSample(browser, temporaryRoot));
  }
  const results = {
    schema_version: 1,
    conditions: {
      arch: os.arch(),
      browser: browserVersionOutput.trim(),
      cpu: os.cpus()[0]?.model ?? "unknown",
      node: process.version,
      platform: os.platform(),
      release: os.release(),
      rounds: ROUNDS,
      total_memory_bytes: os.totalmem(),
    },
    methodology: {
      encoding: "o200k_base",
      fixture: "large-nonrepeated",
      fixture_bytes: 54843,
      heartbeat_interval_milliseconds: 5,
      iterations_per_round: 12,
      network_and_persistence: "denied after explicit local main and worker initialization",
      parity_fixture_count: 12,
    },
    payload: await payloadMeasurements(temporaryRoot),
    samples,
    summary: summarize(samples),
  };
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
