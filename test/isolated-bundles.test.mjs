import assert from "node:assert/strict";
import test from "node:test";

import { build } from "esbuild";

const ENCODINGS = [
  "cl100k_base",
  "gpt2",
  "o200k_base",
  "p50k_base",
  "p50k_edit",
  "r50k_base",
];

test("each isolated browser bundle contains exactly its selected rank module", async () => {
  for (const encoding of ENCODINGS) {
    const result = await build({
      bundle: true,
      format: "esm",
      metafile: true,
      minify: true,
      platform: "browser",
      stdin: {
        contents: `import { createTokenCounter } from "@omiologic/token-counter/encodings/${encoding}"; const counter = createTokenCounter(); export const count = (text) => counter.count(text);`,
        loader: "js",
        resolveDir: process.cwd(),
        sourcefile: `${encoding}-consumer.mjs`,
      },
      target: "es2022",
      treeShaking: true,
      write: false,
    });

    const inputs = Object.keys(result.metafile.inputs);
    const rankModules = inputs
      .filter((path) => path.includes("/js-tiktoken/dist/ranks/"))
      .map((path) => path.slice(path.lastIndexOf("/") + 1))
      .sort();
    assert.deepEqual(rankModules, [`${encoding}.js`], encoding);
    assert.equal(
      inputs.some((path) => path.endsWith("/js-tiktoken/dist/index.js")),
      false,
      `${encoding} used the monolithic dependency entry`,
    );
    assert.equal(result.outputFiles.length, 1, encoding);
  }
});
