import assert from "node:assert/strict";
import test from "node:test";

import { resolveTokenEncoding } from "../dist/index.js";

const SUPPORTED_ENCODINGS = [
  "cl100k_base",
  "gpt2",
  "o200k_base",
  "p50k_base",
  "p50k_edit",
  "r50k_base",
];

const MODEL_CASES = [
  ["openai", "gpt-4", "cl100k_base"],
  ["openai", "gpt-4.1", "o200k_base"],
  ["openai", "gpt-4o", "o200k_base"],
  ["openai", "gpt-4o-mini", "o200k_base"],
];

test("resolves every supported explicit encoding", () => {
  for (const encoding of SUPPORTED_ENCODINGS) {
    assert.equal(resolveTokenEncoding({ encoding }), encoding);
  }
});

test("resolves exact provider and model mappings deterministically", () => {
  const seen = new Set();

  for (const [provider, model, expected] of MODEL_CASES) {
    const key = `${provider}\u0000${model}`;
    assert.equal(seen.has(key), false, `duplicate mapping: ${key}`);
    seen.add(key);

    assert.equal(resolveTokenEncoding({ provider, model }), expected);
    assert.equal(resolveTokenEncoding({ provider, model }), expected);
  }
});

test("gives a valid explicit encoding precedence over hints and fallback", () => {
  assert.equal(
    resolveTokenEncoding({
      encoding: "gpt2",
      fallbackEncoding: "p50k_base",
      provider: "private-provider-value",
      model: "private-model-value",
    }),
    "gpt2",
  );
});

test("uses only an explicit supported fallback for unresolved hints", () => {
  assert.equal(
    resolveTokenEncoding({
      fallbackEncoding: "r50k_base",
      provider: "unknown-provider",
      model: "unknown-model",
    }),
    "r50k_base",
  );
  assert.equal(
    resolveTokenEncoding({ fallbackEncoding: "p50k_edit" }),
    "p50k_edit",
  );
});

test("fails safely for unknown, partial, malformed, and case-mismatched input", () => {
  const privateValues = [
    "private-provider-value",
    "private-model-value",
    "private-encoding-value",
  ];
  const unsupported = [
    {},
    { provider: "openai" },
    { model: "gpt-4o" },
    { provider: "OpenAI", model: "gpt-4o" },
    { provider: "openai", model: "GPT-4O" },
    { provider: privateValues[0], model: privateValues[1] },
    { encoding: privateValues[2], fallbackEncoding: "cl100k_base" },
    { fallbackEncoding: privateValues[2] },
    null,
  ];

  for (const descriptor of unsupported) {
    assert.throws(
      () => resolveTokenEncoding(descriptor),
      (error) => {
        assert.equal(error instanceof Error, true);
        assert.equal(
          error.message,
          "Unsupported token counter selection. Provide a supported encoding or provider/model pair.",
        );
        for (const privateValue of privateValues) {
          assert.equal(error.message.includes(privateValue), false);
        }
        return true;
      },
    );
  }
});
