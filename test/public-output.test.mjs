import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { materializeFixture } from "./fixtures/materialize.mjs";

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
const TOKEN_FIXTURES = JSON.parse(
  await readFile(new URL("./fixtures/token-counts.json", import.meta.url), "utf8"),
);

function normalizeDeclaration(contents) {
  return contents
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/#[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function declarationPaths(path) {
  if (!path.includes("<encoding>")) return [path];
  return ENCODINGS.map((encoding) => path.replace("<encoding>", encoding));
}

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

test("public declaration closure matches the compatibility baseline", async () => {
  const declarationPathsFromExports = Object.values(API_BASELINE.public_subpaths)
    .map(({ types }) => types);
  const declarationPathsFromContracts = Object.keys(
    API_BASELINE.declaration_fragments,
  ).flatMap(declarationPaths);
  const paths = [
    ...new Set([
      ...declarationPathsFromExports,
      ...declarationPathsFromContracts,
    ]),
  ];
  const declarations = new Map();

  for (const path of paths) {
    const contents = await readFile(
      new URL(`..${path.slice(1)}`, import.meta.url),
      "utf8",
    );
    const normalized = normalizeDeclaration(contents);
    declarations.set(path, normalized);
    for (const forbidden of API_BASELINE.forbidden_declaration_fragments) {
      assert.equal(
        normalized.includes(forbidden),
        false,
        `${path}: ${forbidden}`,
      );
    }
  }

  for (const [template, fragments] of Object.entries(
    API_BASELINE.declaration_fragments,
  )) {
    for (const path of declarationPaths(template)) {
      const declaration = declarations.get(path);
      assert.ok(declaration, path);
      for (const fragment of fragments) {
        assert.equal(
          declaration.includes(fragment),
          true,
          `${path}: ${fragment}`,
        );
      }
    }
  }
});

test("pathological input results, errors, and console output remain content-safe", async () => {
  const { JsTiktokenCounter, resolveTokenEncoding } = await import(
    "../dist/index.js"
  );
  const surrogateFixture = TOKEN_FIXTURES.fixtures.find(
    ({ id }) => id === "pathological-embedded-high-surrogate",
  );
  assert.ok(surrogateFixture, "pathological fixture is present");
  const privateInput = `${materializeFixture(surrogateFixture.input)}\u0000private`;
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
