import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ENCODINGS = [
  "cl100k_base",
  "gpt2",
  "o200k_base",
  "p50k_base",
  "p50k_edit",
  "r50k_base",
];
const API_BASELINE = JSON.parse(
  await readFile(
    new URL("./fixtures/public-api-baseline.json", import.meta.url),
    "utf8",
  ),
);

function declarationExports(contents) {
  const values = new Set();
  const typeOnly = new Set();
  for (const match of contents.matchAll(
    /export\s+declare\s+(?:class|const|function|let|var)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    values.add(match[1]);
  }
  for (const match of contents.matchAll(/export\s+(?!type\s)\{([^}]+)\}/gs)) {
    for (const entry of match[1].split(",")) {
      const name = entry.trim().split(/\s+as\s+/).at(-1);
      if (name) values.add(name);
    }
  }
  for (const match of contents.matchAll(/export\s+type\s+\{([^}]+)\}/gs)) {
    for (const entry of match[1].split(",")) {
      const name = entry.trim().split(/\s+as\s+/).at(-1);
      if (name) typeOnly.add(name);
    }
  }
  return {
    typeOnly: [...typeOnly].sort(),
    values: [...values].sort(),
  };
}

async function withPackedPackage(run) {
  const temporaryRoot = await mkdtemp(join(ROOT, ".test-package-"));

  try {
    const stagingRoot = join(temporaryRoot, "staging");
    await mkdir(stagingRoot);
    await cp(join(ROOT, "dist"), join(stagingRoot, "dist"), {
      recursive: true,
    });
    const packageJson = JSON.parse(
      await readFile(join(ROOT, "package.json"), "utf8"),
    );
    // Packing requires a version, but repository version selection is explicitly
    // outside this work item. Use fixture-only metadata that can never be released.
    packageJson.version = "0.0.0-test";
    await writeFile(
      join(stagingRoot, "package.json"),
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );
    const { stdout } = await execFileAsync(
      "npm",
      ["pack", stagingRoot, "--json", "--pack-destination", temporaryRoot],
      { cwd: ROOT },
    );
    const [packResult] = JSON.parse(stdout);
    assert.ok(packResult);

    const archive = join(temporaryRoot, packResult.filename);
    await execFileAsync("tar", ["-xzf", archive, "-C", temporaryRoot]);
    const packageRoot = join(temporaryRoot, "package");
    await symlink(join(ROOT, "node_modules"), join(packageRoot, "node_modules"), "dir");

    await run({ packResult, packageRoot, temporaryRoot });
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

test("root factory composes deterministic selection with the JavaScript adapter", async () => {
  const { createTokenCounter } = await import("@omiologic/token-counter");

  assert.equal(
    createTokenCounter({ provider: "openai", model: "gpt-4o" }).count(
      "hello world",
    ),
    2,
  );
  assert.equal(createTokenCounter({ encoding: "cl100k_base" }).count("hello"), 1);
  assert.throws(
    () => createTokenCounter({ provider: "private-provider", model: "private-model" }),
    (error) =>
      error instanceof Error &&
      !error.message.includes("private-provider") &&
      !error.message.includes("private-model"),
  );
});

test("packed package matches the recorded public API baseline", async () => {
  await withPackedPackage(async ({ packResult, packageRoot, temporaryRoot }) => {
    const filenames = new Set(packResult.files.map(({ path }) => path));
    const baselineFiles = Object.values(API_BASELINE.public_subpaths)
      .flatMap(({ module, types, worker_asset: workerAsset }) => [
        module,
        types,
        workerAsset,
      ])
      .filter(Boolean)
      .map((path) => path.replace(/^\.\//, ""));
    for (const requiredFile of [...baselineFiles, "package.json"]) {
      assert.equal(filenames.has(requiredFile), true, `${requiredFile} was not packed`);
    }
    assert.equal(
      packResult.files.every(
        ({ path }) => path === "package.json" || path.startsWith("dist/"),
      ),
      true,
    );
    const packedManifest = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    );
    assert.equal(API_BASELINE.schema_version, 1);
    assert.equal(packedManifest.name, API_BASELINE.package);
    assert.equal(packedManifest.type, API_BASELINE.runtime.package_type);
    assert.equal(packedManifest.sideEffects, false);
    assert.equal(packedManifest.types, API_BASELINE.public_subpaths["."].types);
    assert.equal(packedManifest.engines.node, API_BASELINE.runtime.node);
    assert.deepEqual(
      Object.keys(packedManifest.exports).sort(),
      Object.keys(API_BASELINE.public_subpaths).sort(),
    );

    for (const [subpath, expected] of Object.entries(
      API_BASELINE.public_subpaths,
    )) {
      assert.deepEqual(packedManifest.exports[subpath], {
        browser: expected.module,
        default: expected.module,
        import: expected.module,
        types: expected.types,
      });
      const publicApi = await import(
        pathToFileURL(join(packageRoot, expected.module))
      );
      assert.deepEqual(
        Object.keys(publicApi).sort(),
        [...expected.value_exports].sort(),
        subpath,
      );
      const declaration = await readFile(
        join(packageRoot, expected.types),
        "utf8",
      );
      const exports = declarationExports(declaration);
      assert.deepEqual(
        exports.values,
        [...expected.value_exports].sort(),
        subpath,
      );
      assert.deepEqual(
        exports.typeOnly,
        [...expected.type_only_exports].sort(),
        subpath,
      );
    }

    const consumer = join(packageRoot, "package-consumer.mjs");
    await writeFile(
      consumer,
      [
        'import { createTokenCounter } from "@omiologic/token-counter";',
        'import { resolveTokenEncoding } from "@omiologic/token-counter/core";',
        'import { JsTiktokenCounter } from "@omiologic/token-counter/js";',
        ...ENCODINGS.map(
          (encoding, index) =>
            `import { createTokenCounter as createIsolated${index} } from "@omiologic/token-counter/encodings/${encoding}";`,
        ),
        ...ENCODINGS.map(
          (encoding, index) =>
            `import { createTokenCounter as createWorker${index} } from "@omiologic/token-counter/workers/${encoding}";`,
        ),
        'if (resolveTokenEncoding({ provider: "openai", model: "gpt-4" }) !== "cl100k_base") throw new Error("core failed");',
        'if (createTokenCounter({ encoding: "cl100k_base" }).count("hello") !== 1) throw new Error("root failed");',
        'if (new JsTiktokenCounter("cl100k_base").count("hello") !== 1) throw new Error("js failed");',
        ...ENCODINGS.map(
          (encoding, index) =>
            `if (createIsolated${index}().count("hello") !== 1) throw new Error("${encoding} failed");`,
        ),
        `if ([${ENCODINGS.map((_, index) => `createWorker${index}`).join(", ")}].some((factory) => typeof factory !== "function")) throw new Error("worker surface failed");`,
      ].join("\n"),
      "utf8",
    );
    await execFileAsync(process.execPath, [consumer], { cwd: packageRoot });
    await execFileAsync(
      process.execPath,
      [
        join(ROOT, "node_modules/esbuild/bin/esbuild"),
        consumer,
        "--bundle",
        "--platform=browser",
        "--format=esm",
        `--outfile=${join(temporaryRoot, "all-surfaces-browser.js")}`,
      ],
      { cwd: packageRoot },
    );

    for (const encoding of ENCODINGS) {
      const isolatedConsumer = join(
        packageRoot,
        `isolated-${encoding}-consumer.mjs`,
      );
      const isolatedBundle = join(
        temporaryRoot,
        `isolated-${encoding}-browser.js`,
      );
      const isolatedMetafile = join(
        temporaryRoot,
        `isolated-${encoding}-meta.json`,
      );
      await writeFile(
        isolatedConsumer,
        `import { createTokenCounter } from "@omiologic/token-counter/encodings/${encoding}"; const counter = createTokenCounter(); globalThis.count = (text) => counter.count(text);`,
        "utf8",
      );
      await execFileAsync(
        process.execPath,
        [
          join(ROOT, "node_modules/esbuild/bin/esbuild"),
          isolatedConsumer,
          "--bundle",
          "--platform=browser",
          "--format=esm",
          `--outfile=${isolatedBundle}`,
          `--metafile=${isolatedMetafile}`,
        ],
        { cwd: packageRoot },
      );

      const isolatedMetadata = JSON.parse(
        await readFile(isolatedMetafile, "utf8"),
      );
      const rankModules = Object.keys(isolatedMetadata.inputs)
        .filter((path) => path.includes("/js-tiktoken/dist/ranks/"))
        .map((path) => path.slice(path.lastIndexOf("/") + 1))
        .sort();
      assert.deepEqual(rankModules, [`${encoding}.js`], encoding);
    }

    const typeConsumer = join(packageRoot, "package-consumer.ts");
    await writeFile(
      typeConsumer,
      await readFile(
        new URL("./fixtures/consumers/public-api.ts", import.meta.url),
        "utf8",
      ),
      "utf8",
    );
    for (const [module, moduleResolution] of [
      ["NodeNext", "NodeNext"],
      ["ESNext", "Bundler"],
    ]) {
      await execFileAsync(
        process.execPath,
        [
          join(ROOT, "node_modules/typescript/bin/tsc"),
          "--noEmit",
          "--ignoreConfig",
          "--strict",
          "--target",
          API_BASELINE.runtime.target,
          "--module",
          module,
          "--moduleResolution",
          moduleResolution,
          typeConsumer,
        ],
        { cwd: packageRoot },
      );
    }
  });
});

test("packed core browser bundle excludes the adapter and tokenizer dependency", async () => {
  await withPackedPackage(async ({ packageRoot, temporaryRoot }) => {
    const entry = join(packageRoot, "core-consumer.js");
    const bundle = join(temporaryRoot, "core-bundle.js");
    const metafile = join(temporaryRoot, "core-meta.json");
    await writeFile(
      entry,
      'import { resolveTokenEncoding } from "@omiologic/token-counter/core"; globalThis.encoding = resolveTokenEncoding({ encoding: "gpt2" });',
      "utf8",
    );

    await execFileAsync(
      process.execPath,
      [
        join(ROOT, "node_modules/esbuild/bin/esbuild"),
        entry,
        "--bundle",
        "--platform=browser",
        "--format=esm",
        `--outfile=${bundle}`,
        `--metafile=${metafile}`,
      ],
      { cwd: packageRoot },
    );

    const metadata = JSON.parse(await readFile(metafile, "utf8"));
    const inputs = Object.keys(metadata.inputs);
    assert.equal(inputs.some((path) => path.includes("js-tiktoken")), false);
    assert.equal(inputs.some((path) => path.includes("adapters/js-tiktoken")), false);
    assert.equal((await readFile(bundle, "utf8")).includes("js-tiktoken"), false);
  });
});

test("packed public declarations contain only application-owned types", async () => {
  await withPackedPackage(async ({ packageRoot }) => {
    for (const declaration of [
      "index.d.ts",
      "core.d.ts",
      "js.d.ts",
      ...ENCODINGS.map((encoding) => `encodings/${encoding}.d.ts`),
      ...ENCODINGS.map((encoding) => `workers/${encoding}.d.ts`),
    ]) {
      const contents = await readFile(join(packageRoot, "dist", declaration), "utf8");
      assert.equal(contents.includes('from "js-tiktoken"'), false);
      assert.equal(contents.includes("number[]"), false);
    }
  });
});
