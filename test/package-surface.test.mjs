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

test("packed package exposes every documented entry point", async () => {
  await withPackedPackage(async ({ packResult, packageRoot, temporaryRoot }) => {
    const filenames = new Set(packResult.files.map(({ path }) => path));
    for (const requiredFile of [
      "dist/index.js",
      "dist/index.d.ts",
      "dist/core.js",
      "dist/core.d.ts",
      "dist/js.js",
      "dist/js.d.ts",
      ...ENCODINGS.flatMap((encoding) => [
        `dist/encodings/${encoding}.js`,
        `dist/encodings/${encoding}.d.ts`,
      ]),
      "package.json",
    ]) {
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
    assert.deepEqual(Object.keys(packedManifest.exports).sort(), [
      ".",
      "./core",
      ...ENCODINGS.map((encoding) => `./encodings/${encoding}`),
      "./js",
    ].sort());

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
        'if (resolveTokenEncoding({ provider: "openai", model: "gpt-4" }) !== "cl100k_base") throw new Error("core failed");',
        'if (createTokenCounter({ encoding: "cl100k_base" }).count("hello") !== 1) throw new Error("root failed");',
        'if (new JsTiktokenCounter("cl100k_base").count("hello") !== 1) throw new Error("js failed");',
        ...ENCODINGS.map(
          (encoding, index) =>
            `if (createIsolated${index}().count("hello") !== 1) throw new Error("${encoding} failed");`,
        ),
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
      [
        'import { createTokenCounter, type TokenCounterDescriptor } from "@omiologic/token-counter";',
        'import { resolveTokenEncoding, type TokenCounter } from "@omiologic/token-counter/core";',
        'import { JsTiktokenCounter } from "@omiologic/token-counter/js";',
        ...ENCODINGS.map(
          (encoding, index) =>
            `import { createTokenCounter as createIsolated${index} } from "@omiologic/token-counter/encodings/${encoding}";`,
        ),
        'const descriptor: TokenCounterDescriptor = { encoding: "cl100k_base" };',
        `const counters: TokenCounter[] = [createTokenCounter(descriptor), new JsTiktokenCounter(resolveTokenEncoding(descriptor)), ${ENCODINGS.map((_, index) => `createIsolated${index}()`).join(", ")}];`,
        'void counters;',
      ].join("\n"),
      "utf8",
    );
    await execFileAsync(
      process.execPath,
      [
        join(ROOT, "node_modules/typescript/bin/tsc"),
        "--noEmit",
        "--ignoreConfig",
        "--strict",
        "--target",
        "ES2022",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        typeConsumer,
      ],
      { cwd: packageRoot },
    );
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
    ]) {
      const contents = await readFile(join(packageRoot, "dist", declaration), "utf8");
      assert.equal(contents.includes('from "js-tiktoken"'), false);
      assert.equal(contents.includes("number[]"), false);
    }
  });
});
