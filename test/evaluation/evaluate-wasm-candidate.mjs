import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const candidateRoot = resolve(process.argv[2] ?? ".");
const ROUNDS = 3;
const EXPECTED = {
  "encoders/o200k_base.cjs":
    "f19e6d4cdbf62a0bfd5880fd494254e7698734f0bd35ef2b707ad0bc5db35dfe",
  "encoders/o200k_base.js":
    "d7be536526a9efd03b46910bdfbfcf73930bd58d23b7c8f433947805eeffa47d",
  "lite/tiktoken_bg.cjs":
    "9112b2ae11d7cedd23915bfbf234269f21596fcdd8b73f5b2756bc6a63f02616",
  "lite/tiktoken_bg.js":
    "eebed1618f6cd2a9c1be475c698eebcac369c8bcff52206804b98ca67068b9c5",
  "lite/tiktoken_bg.wasm":
    "870fa4e0d8fe30a02b4703b2c4e24e7a8d99dcf6a1e8416c14b239f52a2eed55",
};
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
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function summarize(samples) {
  return {
    initialization_milliseconds_median: median(
      samples.map(({ initialization_milliseconds: value }) => value),
    ),
    memory_after_initialization_bytes_median:
      typeof samples[0].memory_after_initialization_bytes === "number"
        ? median(samples.map(({ memory_after_initialization_bytes: value }) => value))
        : Object.fromEntries(
            Object.keys(samples[0].memory_after_initialization_bytes).map((key) => [
              key,
              median(
                samples.map(
                  ({ memory_after_initialization_bytes: value }) => value[key],
                ),
              ),
            ]),
          ),
    steady_state_milliseconds_per_count_median: Object.fromEntries(
      samples[0].steady_state.map(({ fixture_id: fixtureId }) => [
        fixtureId,
        median(
          samples.map(
            ({ steady_state: measurements }) =>
              measurements.find(({ fixture_id: value }) => value === fixtureId)
                .milliseconds_per_count,
          ),
        ),
      ]),
    ),
  };
}

async function verifyCandidate() {
  const packageJson = JSON.parse(
    await readFile(resolve(candidateRoot, "package.json"), "utf8"),
  );
  if (packageJson.name !== "@dqbd/tiktoken" || packageJson.version !== "1.0.22") {
    throw new Error("Candidate package identity did not match @dqbd/tiktoken@1.0.22.");
  }
  for (const [relativePath, expectedHash] of Object.entries(EXPECTED)) {
    const contents = await readFile(resolve(candidateRoot, relativePath));
    if (sha256(contents) !== expectedHash) {
      throw new Error(`Candidate artifact hash mismatch: ${relativePath}`);
    }
  }
}

async function runNodeSample(adapter) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--expose-gc",
      resolve(ROOT, "test/evaluation/wasm-candidate-worker.mjs"),
      adapter,
      candidateRoot,
    ],
    { cwd: ROOT, maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(stdout);
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
  let checkpointAdapter;
  let runtimeArtifactRequests = [];
  let resolveResult;
  const result = new Promise((resolveValue) => {
    resolveResult = resolveValue;
  });
  const files = new Map([
    ["/", resolve(ROOT, "test/evaluation/wasm-candidate-browser.html")],
    ["/index.html", resolve(ROOT, "test/evaluation/wasm-candidate-browser.html")],
    ["/baseline.js", resolve(siteRoot, "baseline.js")],
    ["/fixtures/token-counts.json", resolve(ROOT, "test/fixtures/token-counts.json")],
    [
      "/candidate/lite/tiktoken_bg.js",
      resolve(candidateRoot, "lite/tiktoken_bg.js"),
    ],
    [
      "/candidate/lite/tiktoken_bg.wasm",
      resolve(candidateRoot, "lite/tiktoken_bg.wasm"),
    ],
    [
      "/candidate/encoders/o200k_base.js",
      resolve(candidateRoot, "encoders/o200k_base.js"),
    ],
  ]);
  const artifactPaths = new Set(
    [...files.keys()].filter(
      (path) => path === "/baseline.js" || path.startsWith("/candidate/"),
    ),
  );

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname === "/__wasm_evaluation_checkpoint__") {
        checkpointAdapter = requestUrl.searchParams.get("adapter") ?? "missing";
        response.writeHead(200, { "cache-control": "no-store" });
        response.end("checkpoint");
        return;
      }
      if (requestUrl.pathname === "/__wasm_evaluation_result__") {
        const encoded = requestUrl.searchParams.get("data");
        const parsed = JSON.parse(Buffer.from(encoded ?? "", "base64").toString("utf8"));
        response.writeHead(200, { "cache-control": "no-store" });
        response.end("complete");
        resolveResult(parsed);
        return;
      }
      if (checkpointAdapter !== undefined && artifactPaths.has(requestUrl.pathname)) {
        runtimeArtifactRequests.push(requestUrl.pathname);
      }
      const filePath = files.get(requestUrl.pathname);
      if (filePath === undefined) throw new Error("Unknown fixture path.");
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error("Fixture path was not a file.");
      const body = await readFile(filePath);
      const immutable = artifactPaths.has(requestUrl.pathname);
      response.writeHead(200, {
        "cache-control": immutable
          ? "public, max-age=31536000, immutable"
          : "no-store",
        "content-type": MIME_TYPES.get(extname(filePath)) ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "cache-control": "no-store" });
      response.end("not found");
    }
  });

  return {
    result,
    runtimeArtifactRequests: () => runtimeArtifactRequests,
    server,
  };
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

async function runBrowserSample(browser, adapter, siteRoot) {
  const fixtureServer = createEvaluationServer(siteRoot);
  const origin = await listen(fixtureServer.server);
  const profile = await mkdtemp(join(os.tmpdir(), "token-counter-wasm-browser-"));
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
      `${origin}/index.html?adapter=${adapter}`,
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
      throw new Error(`Browser ${adapter} evaluation did not complete.`);
    }
    if (fixtureServer.runtimeArtifactRequests().length !== 0) {
      throw new Error("Browser requested an adapter artifact after initialization.");
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
  const groups = {
    js: [resolve(siteRoot, "baseline.js")],
    wasm: [
      resolve(candidateRoot, "lite/tiktoken_bg.js"),
      resolve(candidateRoot, "lite/tiktoken_bg.wasm"),
      resolve(candidateRoot, "encoders/o200k_base.js"),
    ],
  };
  return Object.fromEntries(
    await Promise.all(
      Object.entries(groups).map(async ([adapter, paths]) => {
        const files = await Promise.all(
          paths.map(async (path) => {
            const contents = await readFile(path);
            return {
              file: basename(path),
              gzip_bytes: gzipSync(contents, { level: 9 }).byteLength,
              raw_bytes: contents.byteLength,
              sha256: sha256(contents),
            };
          }),
        );
        return [
          adapter,
          {
            files,
            gzip_bytes: files.reduce((sum, file) => sum + file.gzip_bytes, 0),
            raw_bytes: files.reduce((sum, file) => sum + file.raw_bytes, 0),
          },
        ];
      }),
    ),
  );
}

await verifyCandidate();
const temporaryRoot = await mkdtemp(join(os.tmpdir(), "token-counter-wasm-evaluation-"));

try {
  await build({
    bundle: true,
    entryPoints: [resolve(ROOT, "test/bundle-analysis/entries/isolated-o200k.mjs")],
    format: "esm",
    legalComments: "none",
    minify: true,
    outfile: resolve(temporaryRoot, "baseline.js"),
    platform: "browser",
    target: "es2022",
  });

  const browser = await findBrowser();
  const { stdout: browserVersionOutput } = await execFileAsync(browser, ["--version"]);
  const node = { js: [], wasm: [] };
  const browserResults = { js: [], wasm: [] };
  for (const adapter of ["js", "wasm"]) {
    for (let round = 0; round < ROUNDS; round += 1) {
      node[adapter].push(await runNodeSample(adapter));
      browserResults[adapter].push(
        await runBrowserSample(browser, adapter, temporaryRoot),
      );
    }
  }

  const results = {
    schema_version: 1,
    candidate: {
      package: "@dqbd/tiktoken",
      source_commit: "4c8b748e07992c00386f3180af5c574b27b65139",
      version: "1.0.22",
    },
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
      benchmark_iterations: 10,
      encoding: "o200k_base",
      fixtures: ["large-repeated", "large-nonrepeated"],
      initialization: "fresh process or browser profile; module/rank load and counter construction included",
      network: "denied after explicit local asset initialization",
      warmup_iterations: 3,
    },
    payload: await payloadMeasurements(temporaryRoot),
    runtimes: {
      browser: {
        js: { samples: browserResults.js, summary: summarize(browserResults.js) },
        wasm: {
          samples: browserResults.wasm,
          summary: summarize(browserResults.wasm),
        },
      },
      node: {
        js: { samples: node.js, summary: summarize(node.js) },
        wasm: { samples: node.wasm, summary: summarize(node.wasm) },
      },
    },
  };
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
