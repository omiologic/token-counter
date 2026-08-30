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

function rankModules(result) {
  return Object.keys(result.metafile.inputs)
    .filter((path) => path.includes("/js-tiktoken/dist/ranks/"))
    .map((path) => path.slice(path.lastIndexOf("/") + 1))
    .sort();
}

test("worker factories keep tokenizer payloads off the main thread", async () => {
  for (const encoding of ENCODINGS) {
    const result = await build({
      bundle: true,
      format: "esm",
      metafile: true,
      platform: "browser",
      stdin: {
        contents: `export { createTokenCounter } from "@omiologic/token-counter/workers/${encoding}";`,
        loader: "js",
        resolveDir: process.cwd(),
        sourcefile: `${encoding}-worker-consumer.mjs`,
      },
      target: "es2022",
      write: false,
    });

    assert.deepEqual(rankModules(result), [], encoding);
    assert.equal(
      Object.keys(result.metafile.inputs).some((path) =>
        path.includes("js-tiktoken"),
      ),
      false,
      encoding,
    );
    assert.equal(result.outputFiles.length, 1, encoding);
    assert.equal(
      result.outputFiles[0].text.includes(`./${encoding}.worker.js`),
      true,
      encoding,
    );
  }
});

test("each browser worker artifact contains only its selected rank", async () => {
  for (const encoding of ENCODINGS) {
    const result = await build({
      bundle: true,
      entryPoints: [`dist/workers/${encoding}.worker.js`],
      format: "esm",
      metafile: true,
      platform: "browser",
      target: "es2022",
      write: false,
    });

    assert.deepEqual(rankModules(result), [`${encoding}.js`], encoding);
    assert.equal(
      Object.keys(result.metafile.inputs).some((path) =>
        path.endsWith("/js-tiktoken/dist/index.js"),
      ),
      false,
      encoding,
    );
    assert.equal(result.outputFiles.length, 1, encoding);
    assert.equal(result.outputFiles[0].text.includes("postMessage"), true);
  }
});
