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
