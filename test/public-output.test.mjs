import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public exports and declarations contain no token material", async () => {
  const publicApi = await import("../dist/index.js");
  const declaration = await readFile(
    new URL("../dist/index.d.ts", import.meta.url),
    "utf8",
  );
  const adapterDeclaration = await readFile(
    new URL("../dist/adapters/js-tiktoken.d.ts", import.meta.url),
    "utf8",
  );

  assert.deepEqual(Object.keys(publicApi).sort(), [
    "JsTiktokenCounter",
    "createTokenCounter",
    "resolveTokenEncoding",
  ]);
  assert.equal(declaration.includes('from "js-tiktoken"'), false);
  assert.equal(adapterDeclaration.includes('from "js-tiktoken"'), false);
  assert.equal(declaration.includes("number[]"), false);
  assert.equal(adapterDeclaration.includes("number[]"), false);
});

test("results, errors, and console output remain content-safe", async () => {
  const { JsTiktokenCounter, resolveTokenEncoding } = await import(
    "../dist/index.js"
  );
  const privateInput = "private-input-marker";
  const calls = [];
  const originalMethods = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };

  for (const method of Object.keys(originalMethods)) {
    console[method] = (...args) => calls.push([method, ...args]);
  }

  try {
    const result = new JsTiktokenCounter("o200k_base").count(privateInput);
    assert.equal(typeof result, "number");
    assert.equal(Number.isInteger(result), true);
    assert.deepEqual(calls, []);

    assert.throws(
      () => new JsTiktokenCounter(privateInput),
      (error) =>
        error instanceof Error &&
        error.message === "Unsupported token encoding." &&
        !error.message.includes(privateInput),
    );
    assert.throws(
      () => new JsTiktokenCounter("cl100k_base").count({ privateInput }),
      (error) =>
        error instanceof Error &&
        error.message === "Token counting failed." &&
        !error.message.includes(privateInput),
    );
    assert.throws(
      () =>
        resolveTokenEncoding({
          provider: privateInput,
          model: privateInput,
        }),
      (error) =>
        error instanceof Error &&
        !error.message.includes(privateInput),
    );
  } finally {
    Object.assign(console, originalMethods);
  }
});
