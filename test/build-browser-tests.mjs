import { rm } from "node:fs/promises";

import { build } from "esbuild";

await rm(".test-browser", { recursive: true, force: true });

await build({
  bundle: true,
  entryPoints: {
    isolation: "test/browser-isolation-entry.mjs",
    parity: "test/browser-parity-entry.mjs",
  },
  format: "esm",
  outdir: ".test-browser",
  platform: "browser",
});

await build({
  bundle: true,
  entryPoints: {
    workers: "test/browser-worker-entry.mjs",
  },
  format: "esm",
  outdir: ".test-browser",
  platform: "browser",
  target: "es2022",
});

await build({
  bundle: true,
  entryPoints: ["test/browser-worker-initialization-failure-entry.mjs"],
  format: "esm",
  outfile: ".test-browser/initialization-failure.worker.js",
  platform: "browser",
  target: "es2022",
});

for (const encoding of [
  "cl100k_base",
  "gpt2",
  "o200k_base",
  "p50k_base",
  "p50k_edit",
  "r50k_base",
]) {
  await build({
    bundle: true,
    format: "esm",
    outfile: `.test-browser/${encoding}.worker.js`,
    platform: "browser",
    stdin: {
      contents: [
        'import { installBrowserWorkerGuards } from "./test/browser-worker-guard.mjs";',
        "installBrowserWorkerGuards();",
        `const runtime = await import("./dist/workers/${encoding}.worker.js");`,
        `if (runtime.browserWorkerEncoding !== "${encoding}") throw new Error("Worker encoding mismatch.");`,
      ].join("\n"),
      loader: "js",
      resolveDir: process.cwd(),
      sourcefile: `${encoding}.worker-test-entry.mjs`,
    },
    target: "es2022",
  });
}

await build({
  bundle: true,
  entryPoints: ["test/browser-worker-failure-entry.mjs"],
  format: "esm",
  outfile: ".test-browser/failure.worker.js",
  platform: "browser",
  target: "es2022",
});
