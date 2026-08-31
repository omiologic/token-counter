import { createTokenCounter } from "@omiologic/token-counter";
import { resolveTokenEncoding } from "@omiologic/token-counter/core";
import { JsTiktokenCounter } from "@omiologic/token-counter/js";
import fixtureData from "./fixtures/token-counts.json";
import { materializeFixture } from "./fixtures/materialize.mjs";
import { runSyncFuzzParity } from "./fuzz/run-sync.mjs";

const MAX_FIXTURE_BYTES = 64 * 1024;

function assert(condition) {
  if (!condition) {
    throw new Error("Browser parity assertion failed.");
  }
}

export function runBrowserParity() {
  assert(resolveTokenEncoding({ provider: "openai", model: "gpt-4" }) === "cl100k_base");
  assert(resolveTokenEncoding({ provider: "openai", model: "gpt-4o" }) === "o200k_base");
  assert(createTokenCounter({ provider: "openai", model: "gpt-4o" }).count("hello world") === 2);

  for (const encoding of fixtureData.encodings) {
    const counters = [
      createTokenCounter({ encoding }),
      new JsTiktokenCounter(encoding),
    ];

    for (const fixture of fixtureData.fixtures) {
      const text = materializeFixture(fixture.input);
      assert(new TextEncoder().encode(text).byteLength <= MAX_FIXTURE_BYTES);
      for (const counter of counters) {
        const actual = counter.count(text);
        assert(typeof actual === "number");
        assert(Number.isSafeInteger(actual));
        assert(actual === fixture.expected[encoding]);
      }
    }
  }

  runSyncFuzzParity();

  const privateInput = "private-browser-input-marker";
  try {
    resolveTokenEncoding({ provider: privateInput, model: privateInput });
    assert(false);
  } catch (error) {
    assert(error instanceof Error);
    assert(!error.message.includes(privateInput));
  }
}
