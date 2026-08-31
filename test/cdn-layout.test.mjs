import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  CDN_SURFACES,
  materializeCdnLayout,
  sha384,
} from "./cdn-layout.mjs";

test("packed artifacts materialize as an immutable vendorable layout", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "token-counter-cdn-layout-"));
  try {
    const firstLayout = await materializeCdnLayout(join(temporaryRoot, "first"));
    const secondLayout = await materializeCdnLayout(join(temporaryRoot, "second"));
    const { artifactRoot, integrityManifest, packResult } = firstLayout;
    assert.deepEqual(integrityManifest, secondLayout.integrityManifest);
    assert.equal(packResult.files.length > 0, true);
    assert.deepEqual(
      Object.keys(integrityManifest.artifacts).sort(),
      CDN_SURFACES.map(({ subpath }) => subpath).sort(),
    );

    for (const surface of CDN_SURFACES) {
      const metadata = integrityManifest.artifacts[surface.subpath];
      const contents = await readFile(join(artifactRoot, surface.artifact));
      assert.equal(metadata.integrity, sha384(contents), surface.subpath);
      assert.equal(metadata.bytes, contents.byteLength, surface.subpath);
      assert.deepEqual(metadata.external_imports, [], surface.subpath);

      if (surface.subpath.startsWith("./encodings/")) {
        const encoding = surface.subpath.slice("./encodings/".length);
        assert.deepEqual(metadata.rank_modules, [`${encoding}.js`], encoding);
      } else if (surface.subpath.startsWith("./workers/")) {
        const encoding = surface.subpath.slice("./workers/".length);
        assert.deepEqual(metadata.rank_modules, [], encoding);
        assert.ok(metadata.worker);
        const workerContents = await readFile(
          join(artifactRoot, surface.workerArtifact),
        );
        assert.equal(metadata.worker.integrity, sha384(workerContents), encoding);
        assert.equal(metadata.worker.bytes, workerContents.byteLength, encoding);
        assert.deepEqual(metadata.worker.external_imports, [], encoding);
        assert.deepEqual(metadata.worker.rank_modules, [`${encoding}.js`], encoding);
      }
    }

    const repositoryManifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    assert.deepEqual(
      Object.keys(repositoryManifest.exports).sort(),
      CDN_SURFACES.map(({ subpath }) => subpath).sort(),
    );

    const vendoredRoot = join(temporaryRoot, "vendored-token-counter");
    await cp(artifactRoot, vendoredRoot, { recursive: true });
    const rootApi = await import(pathToFileURL(join(vendoredRoot, "index.js")));
    const coreApi = await import(pathToFileURL(join(vendoredRoot, "core.js")));
    const jsApi = await import(pathToFileURL(join(vendoredRoot, "js.js")));
    assert.equal(rootApi.createTokenCounter({ encoding: "cl100k_base" }).count("hello"), 1);
    assert.equal(coreApi.resolveTokenEncoding({ encoding: "gpt2" }), "gpt2");
    assert.equal(new jsApi.JsTiktokenCounter("o200k_base").count("hello"), 1);

    for (const surface of CDN_SURFACES.filter(({ subpath }) =>
      subpath.startsWith("./encodings/"),
    )) {
      const isolatedApi = await import(
        pathToFileURL(join(vendoredRoot, surface.artifact))
      );
      assert.equal(isolatedApi.createTokenCounter().count("hello"), 1);
    }
    for (const surface of CDN_SURFACES.filter(({ subpath }) =>
      subpath.startsWith("./workers/"),
    )) {
      const workerApi = await import(
        pathToFileURL(join(vendoredRoot, surface.artifact))
      );
      assert.equal(typeof workerApi.createTokenCounter, "function");
    }
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});
