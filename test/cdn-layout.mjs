import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("..", import.meta.url));

export const FIXTURE_VERSION = "0.0.0-test";
export const CDN_BASE_PATH =
  `/npm/@omiologic/token-counter@${FIXTURE_VERSION}`;
export const CDN_SURFACES = [
  { artifact: "index.js", source: "dist/index.js", subpath: "." },
  { artifact: "core.js", source: "dist/core.js", subpath: "./core" },
  { artifact: "js.js", source: "dist/js.js", subpath: "./js" },
  ...[
    "cl100k_base",
    "gpt2",
    "o200k_base",
    "p50k_base",
    "p50k_edit",
    "r50k_base",
  ].map((encoding) => ({
    artifact: `encodings/${encoding}.js`,
    source: `dist/encodings/${encoding}.js`,
    subpath: `./encodings/${encoding}`,
  })),
];

function sha384(contents) {
  return `sha384-${createHash("sha384").update(contents).digest("base64")}`;
}

export async function materializeCdnLayout(temporaryRoot) {
  const stagingRoot = join(temporaryRoot, "staging");
  const packedRoot = join(temporaryRoot, "packed");
  const siteRoot = join(temporaryRoot, "site");
  const artifactRoot = join(
    siteRoot,
    "npm",
    "@omiologic",
    `token-counter@${FIXTURE_VERSION}`,
  );

  await mkdir(stagingRoot, { recursive: true });
  await mkdir(packedRoot, { recursive: true });
  await mkdir(artifactRoot, { recursive: true });
  await cp(join(ROOT, "dist"), join(stagingRoot, "dist"), {
    recursive: true,
  });

  const packageJson = JSON.parse(
    await readFile(join(ROOT, "package.json"), "utf8"),
  );
  packageJson.version = FIXTURE_VERSION;
  await writeFile(
    join(stagingRoot, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );

  const { stdout } = await execFileAsync(
    "npm",
    ["pack", stagingRoot, "--json", "--pack-destination", packedRoot],
    { cwd: ROOT },
  );
  const [packResult] = JSON.parse(stdout);
  if (packResult === undefined) {
    throw new Error("Fixture package was not packed.");
  }
  await execFileAsync(
    "tar",
    ["-xzf", join(packedRoot, packResult.filename), "-C", packedRoot],
    { cwd: ROOT },
  );
  const packageRoot = join(packedRoot, "package");
  await symlink(
    join(ROOT, "node_modules"),
    join(packageRoot, "node_modules"),
    "dir",
  );

  const artifacts = {};
  for (const surface of CDN_SURFACES) {
    const outfile = join(artifactRoot, surface.artifact);
    await mkdir(dirname(outfile), { recursive: true });
    const result = await build({
      bundle: true,
      entryPoints: [join(packageRoot, surface.source)],
      format: "esm",
      legalComments: "none",
      metafile: true,
      minify: true,
      outfile,
      platform: "browser",
      target: "es2022",
    });
    const contents = await readFile(outfile);
    const rankModules = Object.keys(result.metafile.inputs)
      .filter((path) => path.includes("/js-tiktoken/dist/ranks/"))
      .map((path) => path.slice(path.lastIndexOf("/") + 1))
      .sort();
    const externalImports = Object.values(result.metafile.outputs)
      .flatMap(({ imports }) => imports.map(({ path }) => path))
      .sort();
    artifacts[surface.subpath] = {
      bytes: contents.byteLength,
      external_imports: externalImports,
      integrity: sha384(contents),
      path: `${CDN_BASE_PATH}/${surface.artifact}`,
      rank_modules: rankModules,
      source_export: surface.source,
    };
  }

  const integrityManifest = {
    schema_version: 1,
    package: "@omiologic/token-counter",
    version: FIXTURE_VERSION,
    base_path: CDN_BASE_PATH,
    artifacts,
  };
  await writeFile(
    join(artifactRoot, "integrity.json"),
    `${JSON.stringify(integrityManifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(siteRoot, "index.html"), browserFixtureHtml(), "utf8");
  await writeFile(
    join(temporaryRoot, "package.json"),
    '{"type":"module"}\n',
    "utf8",
  );

  return {
    artifactRoot,
    integrityManifest,
    packResult,
    packageRoot,
    siteRoot,
  };
}

function browserFixtureHtml() {
  const surfaceUrls = Object.fromEntries(
    CDN_SURFACES.map(({ artifact, subpath }) => [
      subpath,
      `${CDN_BASE_PATH}/${artifact}`,
    ]),
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <link rel="icon" href="data:,">
    <title>Immutable token counter artifact verification</title>
  </head>
  <body>
    <pre id="result" data-status="running">cdn-verification-running</pre>
    <script type="module">
      const surface = new URLSearchParams(location.search).get("surface");
      const urls = ${JSON.stringify(surfaceUrls)};
      const result = document.querySelector("#result");
      const fail = () => location.replace("/__token_counter_cdn_failed__?surface=" + encodeURIComponent(surface ?? "missing"));
      try {
        if (!(surface in urls)) throw new Error("Unknown fixture surface.");
        const publicApi = await import(urls[surface]);
        const loadedResponse = await fetch("/__token_counter_cdn_modules_loaded__?surface=" + encodeURIComponent(surface));
        if (!loadedResponse.ok) throw new Error("Load checkpoint failed.");

        let consoleCalls = 0;
        for (const method of ["debug", "error", "info", "log", "warn"]) {
          console[method] = () => { consoleCalls += 1; };
        }
        const deny = () => { throw new Error("runtime capability denied by test"); };
        globalThis.fetch = deny;
        if (globalThis.XMLHttpRequest) globalThis.XMLHttpRequest.prototype.open = deny;
        globalThis.WebSocket = deny;
        globalThis.EventSource = deny;
        if (globalThis.Navigator?.prototype?.sendBeacon) globalThis.Navigator.prototype.sendBeacon = deny;
        if (globalThis.Storage?.prototype?.setItem) globalThis.Storage.prototype.setItem = deny;
        if (globalThis.indexedDB?.open) globalThis.indexedDB.open = deny;
        if (globalThis.caches?.open) globalThis.caches.open = deny;

        if (surface === ".") {
          if (publicApi.createTokenCounter({ encoding: "cl100k_base" }).count("hello") !== 1) throw new Error("Root failed.");
        } else if (surface === "./core") {
          if (publicApi.resolveTokenEncoding({ provider: "openai", model: "gpt-4" }) !== "cl100k_base") throw new Error("Core failed.");
        } else if (surface === "./js") {
          if (new publicApi.JsTiktokenCounter("cl100k_base").count("hello") !== 1) throw new Error("JavaScript adapter failed.");
        } else if (publicApi.createTokenCounter().count("hello") !== 1) {
          throw new Error("Isolated encoding failed.");
        }
        if (consoleCalls !== 0) throw new Error("Unexpected console output.");
        result.dataset.status = "passed";
        result.textContent = "cdn-verification-ok";
        location.replace("/__token_counter_cdn_passed__?surface=" + encodeURIComponent(surface));
      } catch {
        fail();
      }
    </script>
  </body>
</html>
`;
}

export { sha384 };
