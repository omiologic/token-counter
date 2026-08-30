import { createTokenCounter as createCl100kBaseCounter } from "@omiologic/token-counter/encodings/cl100k_base";
import { createTokenCounter as createGpt2Counter } from "@omiologic/token-counter/encodings/gpt2";
import { createTokenCounter as createO200kBaseCounter } from "@omiologic/token-counter/encodings/o200k_base";
import { createTokenCounter as createP50kBaseCounter } from "@omiologic/token-counter/encodings/p50k_base";
import { createTokenCounter as createP50kEditCounter } from "@omiologic/token-counter/encodings/p50k_edit";
import { createTokenCounter as createR50kBaseCounter } from "@omiologic/token-counter/encodings/r50k_base";
import fixtureData from "./fixtures/token-counts.json";
import { materializeFixture } from "./fixtures/materialize.mjs";

const COUNTERS = {
  cl100k_base: createCl100kBaseCounter,
  gpt2: createGpt2Counter,
  o200k_base: createO200kBaseCounter,
  p50k_base: createP50kBaseCounter,
  p50k_edit: createP50kEditCounter,
  r50k_base: createR50kBaseCounter,
};

function assert(condition) {
  if (!condition) {
    throw new Error("Browser isolation assertion failed.");
  }
}

export function runBrowserIsolationProof() {
  for (const [encoding, createCounter] of Object.entries(COUNTERS)) {
    const counter = createCounter();
    for (const fixture of fixtureData.fixtures) {
      const actual = counter.count(materializeFixture(fixture.input));
      assert(actual === fixture.expected[encoding]);
    }
  }
}
