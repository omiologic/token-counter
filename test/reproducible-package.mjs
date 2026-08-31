import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { build } from "esbuild";

import {
  CDN_SURFACES,
  materializeCdnLayout,
  sha384,
} from "./cdn-layout.mjs";

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE_VERSION = "0.0.0-reproducibility-test";
const ENCODINGS = [
  "cl100k_base",
  "gpt2",
  "o200k_base",
  "p50k_base",
  "p50k_edit",
  "r50k_base",
];
const BUILD_INPUTS = ["package.json", "package-lock.json", "tsconfig.json", "src"];
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
const fixtureData = JSON.parse(
  await readFile(new URL("./fixtures/token-counts.json", import.meta.url), "utf8"),
);

function contentHash(contents) {
  return `sha384-${createHash("sha384").update(contents).digest("base64")}`;
}

async function run(command, args, cwd) {
  return execFileAsync(command, args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function listFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error("Packed package contained a non-file entry.");
    }
  }
  await visit(root);
  return files.sort();
}

async function normalizedManifest(packageRoot) {
  return Promise.all(
    (await listFiles(packageRoot)).map(async (absolute) => {
      const contents = await readFile(absolute);
      return {
        bytes: contents.byteLength,
        integrity: contentHash(contents),
        path: relative(packageRoot, absolute).split(sep).join("/"),
      };
    }),
  );
}

async function cleanBuildAndPack(qualificationRoot, label) {
  const buildRoot = join(qualificationRoot, `build-${label}`);
  const packRoot = join(qualificationRoot, `pack-${label}`);
  await mkdir(buildRoot, { recursive: true });
  await mkdir(packRoot, { recursive: true });
  for (const input of BUILD_INPUTS) {
    await cp(join(ROOT, input), join(buildRoot, input), { recursive: true });
  }

  await run(
    "npm",
    ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
    buildRoot,
  );
  await run("npm", ["run", "build"], buildRoot);

  const packageJsonPath = join(buildRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.version = FIXTURE_VERSION;
  await writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );
  const { stdout } = await run(
    "npm",
    ["pack", ".", "--ignore-scripts", "--json", "--pack-destination", packRoot],
    buildRoot,
  );
  const [packResult] = JSON.parse(stdout);
  assert.ok(packResult, "npm pack did not describe an artifact");
  const tarball = join(packRoot, packResult.filename);
  await run("tar", ["-xzf", tarball, "-C", packRoot], buildRoot);
  const packageRoot = join(packRoot, "package");
  const manifest = await normalizedManifest(packageRoot);
  const packedPaths = packResult.files.map(({ path }) => path).sort();
  assert.deepEqual(
    manifest.map(({ path }) => path),
    packedPaths,
    "npm's file list differs from the extracted package",
  );
  assert.equal(
    manifest.every(({ path }) => path === "package.json" || path.startsWith("dist/")),
    true,
    "package contains a file outside package.json and dist/",
  );
  for (const excluded of ["src/", "test/", "_notes/", ".agents/", "coverage/", ".test-"]) {
    assert.equal(
      manifest.some(({ path }) => path.startsWith(excluded)),
      false,
      `package unexpectedly contains ${excluded}`,
    );
  }
  return {
    archiveIntegrity: contentHash(await readFile(tarball)),
    manifest,
    packageRoot,
    tarball,
  };
}

function materializeFixtureSource() {
  return `
const fixtureData = ${JSON.stringify(fixtureData)};
function materializeFixture(input) {
  if (input.kind === "literal") return input.text;
  if (input.kind === "repeat") return input.text.repeat(input.repetitions);
  if (input.kind === "utf16-code-units") return String.fromCharCode(...input.codeUnits);
  if (input.kind === "numbered-lines") {
    return Array.from({ length: input.lines }, (_, index) =>
      "row-" + index + ": alpha-" + (index % 17) + ", beta-" + ((index * 7) % 101) + "\\n"
    ).join("");
  }
  throw new Error("Unsupported fixture recipe.");
}
function checkCount(count, expected) {
  if (!Number.isSafeInteger(count) || count !== expected) throw new Error("Count mismatch.");
}
`;
}

function syncImports() {
  return [
    'import { createTokenCounter as createRoot } from "@omiologic/token-counter";',
    'import { resolveTokenEncoding } from "@omiologic/token-counter/core";',
    'import { JsTiktokenCounter } from "@omiologic/token-counter/js";',
    ...ENCODINGS.map(
      (encoding, index) =>
        `import { createTokenCounter as createIsolated${index} } from "@omiologic/token-counter/encodings/${encoding}";`,
    ),
  ].join("\n");
}

function workerImports() {
  return ENCODINGS.map(
    (encoding, index) =>
      `import { createTokenCounter as createWorker${index} } from "@omiologic/token-counter/workers/${encoding}";`,
  ).join("\n");
}

function syncVerificationBody() {
  return `
if (resolveTokenEncoding({ provider: "openai", model: "gpt-4o" }) !== "o200k_base") throw new Error("Core mismatch.");
const isolatedFactories = [${ENCODINGS.map((_, index) => `createIsolated${index}`).join(",")}];
for (let encodingIndex = 0; encodingIndex < fixtureData.encodings.length; encodingIndex += 1) {
  const encoding = fixtureData.encodings[encodingIndex];
  const counters = [
    createRoot({ encoding }),
    new JsTiktokenCounter(encoding),
    isolatedFactories[encodingIndex](),
  ];
  for (const fixture of fixtureData.fixtures) {
    const text = materializeFixture(fixture.input);
    for (const counter of counters) checkCount(counter.count(text), fixture.expected[encoding]);
  }
}
const privateMarker = "private-installed-consumer-marker";
try {
  createRoot({ provider: privateMarker, model: privateMarker });
  throw new Error("Unknown selection succeeded.");
} catch (error) {
  if (!(error instanceof Error) || error.message.includes(privateMarker)) throw new Error("Unsafe public error.");
}
`;
}

function runtimeGuardsSource() {
  return `
const deny = () => { throw new Error("Runtime capability denied."); };
for (const method of ["debug", "error", "info", "log", "warn"]) console[method] = deny;
globalThis.fetch = deny;
if (globalThis.XMLHttpRequest) globalThis.XMLHttpRequest.prototype.open = deny;
globalThis.WebSocket = deny;
globalThis.EventSource = deny;
if (globalThis.Navigator?.prototype?.sendBeacon) globalThis.Navigator.prototype.sendBeacon = deny;
if (globalThis.Storage?.prototype?.setItem) globalThis.Storage.prototype.setItem = deny;
if (globalThis.indexedDB?.open) globalThis.indexedDB.open = deny;
if (globalThis.caches?.open) globalThis.caches.open = deny;
`;
}

function nodeConsumerSource() {
  return `
${syncImports()}
${workerImports()}
${materializeFixtureSource()}
${runtimeGuardsSource()}
${syncVerificationBody()}
const workerFactories = [${ENCODINGS.map((_, index) => `createWorker${index}`).join(",")}];
if (workerFactories.some((factory) => typeof factory !== "function")) throw new Error("Worker export mismatch.");
`;
}

function browserSyncSource() {
  return `
${syncImports()}
${materializeFixtureSource()}
async function verify() {
  const checkpoint = await fetch("/__checkpoint__");
  if (!checkpoint.ok) throw new Error("Checkpoint failed.");
  ${runtimeGuardsSource()}
  ${syncVerificationBody()}
}
verify().then(
  () => location.replace("/__passed__"),
  () => location.replace("/__failed__"),
);
`;
}

function browserWorkerSource() {
  return `
${workerImports()}
${materializeFixtureSource()}
async function verify() {
  const factories = [${ENCODINGS.map((_, index) => `createWorker${index}`).join(",")}];
  const counters = await Promise.all(factories.map((factory) => factory()));
  const checkpoint = await fetch("/__checkpoint__");
  if (!checkpoint.ok) throw new Error("Checkpoint failed.");
  ${runtimeGuardsSource()}
  try {
    for (let encodingIndex = 0; encodingIndex < fixtureData.encodings.length; encodingIndex += 1) {
      const encoding = fixtureData.encodings[encodingIndex];
      for (const fixture of fixtureData.fixtures) {
        const count = await counters[encodingIndex].count(materializeFixture(fixture.input));
        checkCount(count, fixture.expected[encoding]);
      }
    }
  } finally {
    for (const counter of counters) counter.close();
  }
}
verify().then(
  () => location.replace("/__passed__"),
  () => location.replace("/__failed__"),
);
`;
}

async function installConsumer(qualificationRoot, buildResult, label) {
  const consumerRoot = join(qualificationRoot, `consumer-${label}`);
  await mkdir(consumerRoot, { recursive: true });
  await writeFile(
    join(consumerRoot, "package.json"),
    `${JSON.stringify({
      name: `token-counter-reproducibility-consumer-${label}`,
      private: true,
      type: "module",
      dependencies: {
        "@omiologic/token-counter": `file:${buildResult.tarball}`,
      },
    }, null, 2)}\n`,
    "utf8",
  );
  await run(
    "npm",
    ["install", "--ignore-scripts", "--offline", "--no-audit", "--no-fund"],
    consumerRoot,
  );
  const installedPackageRoot = join(
    consumerRoot,
    "node_modules",
    "@omiologic",
    "token-counter",
  );
  assert.deepEqual(
    await normalizedManifest(installedPackageRoot),
    buildResult.manifest,
    "installed package differs from extracted tarball",
  );
  const nodeEntry = join(consumerRoot, "node-consumer.mjs");
  await writeFile(nodeEntry, nodeConsumerSource(), "utf8");
  const nodeResult = await run(process.execPath, [nodeEntry], consumerRoot);
  assert.equal(nodeResult.stdout, "");
  assert.equal(nodeResult.stderr, "");
  const typeEntry = join(consumerRoot, "public-api-consumer.ts");
  await cp(
    join(ROOT, "test", "fixtures", "consumers", "public-api.ts"),
    typeEntry,
  );
  for (const [module, moduleResolution] of [
    ["NodeNext", "NodeNext"],
    ["ESNext", "Bundler"],
  ]) {
    await run(
      process.execPath,
      [
        join(ROOT, "node_modules", "typescript", "bin", "tsc"),
        "--noEmit",
        "--ignoreConfig",
        "--strict",
        "--target",
        "ES2022",
        "--module",
        module,
        "--moduleResolution",
        moduleResolution,
        typeEntry,
      ],
      consumerRoot,
    );
  }
  return { consumerRoot, installedPackageRoot };
}

function rankModules(metafile) {
  return Object.keys(metafile.inputs)
    .filter((path) => path.includes("/js-tiktoken/dist/ranks/"))
    .map((path) => path.slice(path.lastIndexOf("/") + 1))
    .sort();
}

async function buildBrowserConsumer(consumer) {
  const siteRoot = join(consumer.consumerRoot, "browser-site");
  await mkdir(siteRoot, { recursive: true });
  const syncEntry = join(consumer.consumerRoot, "browser-sync.mjs");
  const workerEntry = join(consumer.consumerRoot, "browser-workers.mjs");
  await writeFile(syncEntry, browserSyncSource(), "utf8");
  await writeFile(workerEntry, browserWorkerSource(), "utf8");
  await build({
    bundle: true,
    entryPoints: [syncEntry],
    format: "esm",
    outfile: join(siteRoot, "sync.js"),
    platform: "browser",
    target: "es2022",
  });
  const workerMainBuild = await build({
    bundle: true,
    entryPoints: [workerEntry],
    format: "esm",
    metafile: true,
    outfile: join(siteRoot, "workers.js"),
    platform: "browser",
    target: "es2022",
  });
  assert.deepEqual(rankModules(workerMainBuild.metafile), []);
  assert.equal(
    Object.keys(workerMainBuild.metafile.inputs).some((path) => path.includes("js-tiktoken")),
    false,
    "worker-only main-thread bundle contains tokenizer code",
  );

  for (const encoding of ENCODINGS) {
    const isolatedBuild = await build({
      bundle: true,
      entryPoints: [
        join(consumer.installedPackageRoot, "dist", "encodings", `${encoding}.js`),
      ],
      format: "esm",
      metafile: true,
      outfile: join(siteRoot, `isolated-${encoding}.js`),
      platform: "browser",
      target: "es2022",
    });
    assert.deepEqual(rankModules(isolatedBuild.metafile), [`${encoding}.js`]);

    const workerSource = join(
      consumer.installedPackageRoot,
      "dist",
      "workers",
      `${encoding}.worker.js`,
    );
    const workerBuild = await build({
      bundle: true,
      format: "esm",
      metafile: true,
      outfile: join(siteRoot, `${encoding}.worker.js`),
      platform: "browser",
      stdin: {
        contents: `${runtimeGuardsSource()}\nawait import(${JSON.stringify(workerSource)});`,
        loader: "js",
        resolveDir: consumer.consumerRoot,
        sourcefile: `${encoding}.installed-worker-entry.mjs`,
      },
      target: "es2022",
    });
    assert.deepEqual(rankModules(workerBuild.metafile), [`${encoding}.js`]);
  }
  await writeFile(
    join(siteRoot, "sync.html"),
    '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="module" src="./sync.js"></script>\n',
    "utf8",
  );
  await writeFile(
    join(siteRoot, "workers.html"),
    '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="module" src="./workers.js"></script>\n',
    "utf8",
  );
  return siteRoot;
}

async function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next fixed local browser location.
    }
  }
  throw new Error("No supported local browser executable was found.");
}

function createFixtureServer(siteRoot) {
  let checkpointReached = false;
  let resolveOutcome;
  const requestsAfterCheckpoint = [];
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/__checkpoint__") {
      checkpointReached = true;
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("ready");
      return;
    }
    if (pathname === "/__passed__" || pathname === "/__failed__") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end(pathname === "/__passed__" ? "ok" : "failed");
      resolveOutcome?.(pathname === "/__passed__" ? "passed" : "failed");
      return;
    }
    if (checkpointReached) requestsAfterCheckpoint.push(pathname);
    try {
      const relativePath = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
      const filePath = resolve(siteRoot, relativePath);
      if (filePath !== siteRoot && !filePath.startsWith(`${siteRoot}${sep}`)) {
        throw new Error("Path escaped fixture root.");
      }
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error("Requested path is not a file.");
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": MIME_TYPES.get(extname(filePath)) ?? "application/octet-stream",
      });
      response.end(await readFile(filePath));
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
    }
  });
  return {
    requestsAfterCheckpoint,
    reset() {
      checkpointReached = false;
      requestsAfterCheckpoint.length = 0;
    },
    server,
    waitForOutcome() {
      return new Promise((resolveResult) => {
        resolveOutcome = resolveResult;
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
    throw new Error("Browser fixture server did not expose a local port.");
  }
  return `http://127.0.0.1:${address.port}`;
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
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && code !== null) reject(new Error(`Browser exited with code ${code}: ${stderr}`));
      else resolveClosed();
    });
  });
  let timeout;
  try {
    const result = await Promise.race([
      outcome,
      closed.then(() => "closed"),
      new Promise((resolveTimeout) => {
        timeout = setTimeout(() => resolveTimeout("timeout"), 120_000);
      }),
    ]);
    assert.equal(result, "passed", `installed-package browser verification ${result}`);
  } finally {
    clearTimeout(timeout);
    child.kill("SIGKILL");
    await Promise.race([
      closed.catch(() => undefined),
      new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
    ]);
  }
}

async function verifyBrowserConsumer(siteRoot, browser) {
  const fixtureServer = createFixtureServer(siteRoot);
  const origin = await listen(fixtureServer.server);
  try {
    for (const page of ["sync.html", "workers.html"]) {
      fixtureServer.reset();
      const profile = await mkdtemp(join(tmpdir(), "token-counter-repro-browser-"));
      try {
        await runBrowser(
          browser,
          `${origin}/${page}`,
          profile,
          fixtureServer.waitForOutcome(),
        );
        assert.deepEqual(
          fixtureServer.requestsAfterCheckpoint,
          [],
          `${page} requested an asset after initialization`,
        );
      } finally {
        await rm(profile, { recursive: true, force: true });
      }
    }
  } finally {
    await new Promise((resolveClosed) => fixtureServer.server.close(resolveClosed));
  }
}

async function verifyCdnAndVendoring(qualificationRoot, consumer, label) {
  const layout = await materializeCdnLayout(join(qualificationRoot, `cdn-${label}`), {
    packageRoot: consumer.installedPackageRoot,
  });
  for (const surface of CDN_SURFACES) {
    const metadata = layout.integrityManifest.artifacts[surface.subpath];
    const artifact = await readFile(join(layout.artifactRoot, surface.artifact));
    assert.equal(metadata.integrity, sha384(artifact));
    assert.deepEqual(metadata.external_imports, []);
    if (surface.workerArtifact !== undefined) {
      const worker = await readFile(join(layout.artifactRoot, surface.workerArtifact));
      assert.equal(metadata.worker.integrity, sha384(worker));
      assert.deepEqual(metadata.worker.rank_modules, [
        `${surface.subpath.slice("./workers/".length)}.js`,
      ]);
    }
  }
  const vendoredRoot = join(qualificationRoot, `vendored-${label}`);
  await cp(layout.artifactRoot, vendoredRoot, { recursive: true });
  const rootApi = await import(pathToFileURL(join(vendoredRoot, "index.js")));
  const coreApi = await import(pathToFileURL(join(vendoredRoot, "core.js")));
  const jsApi = await import(pathToFileURL(join(vendoredRoot, "js.js")));
  assert.equal(rootApi.createTokenCounter({ encoding: "cl100k_base" }).count("hello"), 1);
  assert.equal(coreApi.resolveTokenEncoding({ encoding: "gpt2" }), "gpt2");
  assert.equal(new jsApi.JsTiktokenCounter("o200k_base").count("hello"), 1);
  for (const encoding of ENCODINGS) {
    const isolatedApi = await import(
      pathToFileURL(join(vendoredRoot, "encodings", `${encoding}.js`))
    );
    const workerApi = await import(
      pathToFileURL(join(vendoredRoot, "workers", `${encoding}.js`))
    );
    assert.equal(isolatedApi.createTokenCounter().count("hello"), 1);
    assert.equal(typeof workerApi.createTokenCounter, "function");
  }
  return layout.integrityManifest;
}

const qualificationRoot = await mkdtemp(
  join(tmpdir(), "token-counter-reproducibility-"),
);

try {
  const firstBuild = await cleanBuildAndPack(qualificationRoot, "first");
  const secondBuild = await cleanBuildAndPack(qualificationRoot, "second");
  assert.deepEqual(firstBuild.manifest, secondBuild.manifest);
  const manifestIntegrity = contentHash(
    Buffer.from(`${JSON.stringify(firstBuild.manifest)}\n`, "utf8"),
  );

  const firstConsumer = await installConsumer(qualificationRoot, firstBuild, "first");
  const secondConsumer = await installConsumer(qualificationRoot, secondBuild, "second");
  const browser = await findBrowser();
  await verifyBrowserConsumer(await buildBrowserConsumer(firstConsumer), browser);
  await verifyBrowserConsumer(await buildBrowserConsumer(secondConsumer), browser);
  const firstCdn = await verifyCdnAndVendoring(
    qualificationRoot,
    firstConsumer,
    "first",
  );
  const secondCdn = await verifyCdnAndVendoring(
    qualificationRoot,
    secondConsumer,
    "second",
  );
  assert.deepEqual(firstCdn, secondCdn);

  process.stdout.write(`${JSON.stringify({
    archive_integrity_equal:
      firstBuild.archiveIntegrity === secondBuild.archiveIntegrity,
    first_archive_integrity: firstBuild.archiveIntegrity,
    manifest_integrity: manifestIntegrity,
    package_files: firstBuild.manifest.length,
    second_archive_integrity: secondBuild.archiveIntegrity,
    status: "reproducible-package-ok",
  }, null, 2)}\n`);
} finally {
  await rm(qualificationRoot, { recursive: true, force: true });
}
