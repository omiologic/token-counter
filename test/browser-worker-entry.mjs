import { createBrowserWorkerTokenCounter } from "../dist/adapters/browser-worker.js";
import { createTokenCounter as createCl100kBase } from "@omiologic/token-counter/workers/cl100k_base";
import { createTokenCounter as createGpt2 } from "@omiologic/token-counter/workers/gpt2";
import { createTokenCounter as createO200kBase } from "@omiologic/token-counter/workers/o200k_base";
import { createTokenCounter as createP50kBase } from "@omiologic/token-counter/workers/p50k_base";
import { createTokenCounter as createP50kEdit } from "@omiologic/token-counter/workers/p50k_edit";
import { createTokenCounter as createR50kBase } from "@omiologic/token-counter/workers/r50k_base";
import fixtureData from "./fixtures/token-counts.json";
import { materializeFixture } from "./fixtures/materialize.mjs";

const FACTORIES = {
  cl100k_base: createCl100kBase,
  gpt2: createGpt2,
  o200k_base: createO200kBase,
  p50k_base: createP50kBase,
  p50k_edit: createP50kEdit,
  r50k_base: createR50kBase,
};

function assert(condition) {
  if (!condition) throw new Error("Browser worker assertion failed.");
}

async function expectRejection(promise, expectedMessage, privateMarker) {
  try {
    await promise;
    assert(false);
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message === expectedMessage);
    assert(!error.message.includes(privateMarker));
  }
}

export async function runBrowserWorkerVerification(checkpoint) {
  const privateMarker = "private-browser-worker-marker";
  const counters = Object.fromEntries(
    await Promise.all(
      Object.entries(FACTORIES).map(async ([encoding, factory]) => [
        encoding,
        await factory(),
      ]),
    ),
  );
  const failingCounter = await createBrowserWorkerTokenCounter(
    new URL("./failure.worker.js", import.meta.url),
    "@omiologic/token-counter:test-failure",
  );
  await expectRejection(
    createBrowserWorkerTokenCounter(
      new URL("./initialization-failure.worker.js", import.meta.url),
      "@omiologic/token-counter:test-initialization-failure",
    ),
    "Token counter initialization failed.",
    privateMarker,
  );

  await checkpoint();

  for (const encoding of fixtureData.encodings) {
    const counter = counters[encoding];
    assert(counter !== undefined);
    const counts = await Promise.all(
      fixtureData.fixtures.map((fixture) =>
        counter.count(materializeFixture(fixture.input)),
      ),
    );
    counts.forEach((count, index) => {
      const fixture = fixtureData.fixtures[index];
      assert(fixture !== undefined);
      assert(Number.isSafeInteger(count));
      assert(count === fixture.expected[encoding]);
    });
  }

  await expectRejection(
    counters.cl100k_base.count({ privateMarker }),
    "Token counting failed.",
    privateMarker,
  );
  await expectRejection(
    failingCounter.count(privateMarker),
    "Token counter worker failed.",
    privateMarker,
  );
  await expectRejection(
    failingCounter.count(privateMarker),
    "Token counter worker failed.",
    privateMarker,
  );

  const largeFixture = fixtureData.fixtures.find(
    ({ id }) => id === "large-nonrepeated",
  );
  assert(largeFixture !== undefined);
  const pending = counters.o200k_base.count(
    materializeFixture(largeFixture.input),
  );
  counters.o200k_base.close();
  await expectRejection(pending, "Token counter is closed.", privateMarker);
  await expectRejection(
    counters.o200k_base.count(privateMarker),
    "Token counter is closed.",
    privateMarker,
  );

  failingCounter.close();
  for (const counter of Object.values(counters)) counter.close();
}
