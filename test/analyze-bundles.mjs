import { gzipSync } from "node:zlib";

import { build, version as esbuildVersion } from "esbuild";

const ENTRIES = [
  "core",
  "lite-runtime",
  "full-cl100k",
  "isolated-cl100k",
  "isolated-o200k",
  "js",
  "root",
];

async function measure(entry) {
  const result = await build({
    bundle: true,
    entryPoints: [`test/bundle-analysis/entries/${entry}.mjs`],
    format: "esm",
    metafile: true,
    minify: true,
    platform: "browser",
    target: "es2022",
    treeShaking: true,
    write: false,
  });
  const output = result.outputFiles.at(0)?.contents;
  if (output === undefined) {
    throw new Error("Bundle analysis produced no output.");
  }

  const rankModules = Object.keys(result.metafile.inputs)
    .filter((path) => path.includes("/js-tiktoken/dist/ranks/"))
    .map((path) => path.slice(path.lastIndexOf("/") + 1))
    .sort();

  return {
    entry,
    raw_bytes: output.byteLength,
    gzip_bytes: gzipSync(output, { level: 9 }).byteLength,
    rank_modules: rankModules,
  };
}

const measurements = [];
for (const entry of ENTRIES) {
  measurements.push(await measure(entry));
}

process.stdout.write(
  `${JSON.stringify(
    {
      schema_version: 1,
      bundler: `esbuild@${esbuildVersion}`,
      configuration: {
        bundle: true,
        format: "esm",
        minify: true,
        platform: "browser",
        target: "es2022",
        tree_shaking: true,
        gzip_level: 9,
      },
      measurements,
    },
    null,
    2,
  )}\n`,
);
