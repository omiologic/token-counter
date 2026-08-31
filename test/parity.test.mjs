import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import test from "node:test";
import tls from "node:tls";

import { materializeFixture } from "./fixtures/materialize.mjs";

const fixtureData = JSON.parse(
  await readFile(new URL("./fixtures/token-counts.json", import.meta.url), "utf8"),
);

const MAX_FIXTURE_BYTES = 64 * 1024;

function denyNetwork() {
  throw new Error("network access denied by test");
}

test(
  "root, /js, and isolated surfaces match trusted counts with runtime network denied",
  { timeout: 120_000 },
  async () => {
    const consoleCalls = [];
    const originals = {
      fetch: globalThis.fetch,
      httpGet: http.get,
      httpRequest: http.request,
      httpsGet: https.get,
      httpsRequest: https.request,
      netConnect: net.connect,
      netCreateConnection: net.createConnection,
      tlsConnect: tls.connect,
      console: Object.fromEntries(
        ["debug", "error", "info", "log", "warn"].map((method) => [
          method,
          console[method],
        ]),
      ),
    };

    globalThis.fetch = denyNetwork;
    http.get = denyNetwork;
    http.request = denyNetwork;
    https.get = denyNetwork;
    https.request = denyNetwork;
    net.connect = denyNetwork;
    net.createConnection = denyNetwork;
    tls.connect = denyNetwork;
    for (const method of Object.keys(originals.console)) {
      console[method] = (...args) => consoleCalls.push([method, ...args]);
    }

    try {
      const { createTokenCounter } = await import("@omiologic/token-counter");
      const { JsTiktokenCounter } = await import(
        "@omiologic/token-counter/js"
      );

      const fixtureById = new Map(
        fixtureData.fixtures.map((fixture) => [fixture.id, fixture]),
      );
      const precomposed = materializeFixture(
        fixtureById.get("pathological-nfc-precomposed").input,
      );
      const combining = materializeFixture(
        fixtureById.get("pathological-nfd-combining").input,
      );
      assert.notEqual(precomposed, combining, "normalization fixtures differ");
      assert.equal(precomposed.normalize("NFD"), combining, "normalization pair");
      assert.deepEqual(
        Array.from(
          materializeFixture(
            fixtureById.get("pathological-embedded-high-surrogate").input,
          ),
          (character) => character.charCodeAt(0),
        ),
        [65, 55296, 66],
        "embedded surrogate code units",
      );

      for (const encoding of fixtureData.encodings) {
        const isolated = await import(
          `@omiologic/token-counter/encodings/${encoding}`
        );
        const counters = [
          ["root", createTokenCounter({ encoding })],
          ["js", new JsTiktokenCounter(encoding)],
          ["isolated", isolated.createTokenCounter()],
        ];

        for (const fixture of fixtureData.fixtures) {
          const text = materializeFixture(fixture.input);
          const byteLength = new TextEncoder().encode(text).byteLength;
          assert.equal(byteLength <= MAX_FIXTURE_BYTES, true, fixture.id);

          for (const [surface, counter] of counters) {
            const metadata = `${surface}/${encoding}/${fixture.id}`;
            const actual = counter.count(text);
            assert.equal(typeof actual, "number", metadata);
            assert.equal(Number.isSafeInteger(actual), true, metadata);
            assert.equal(actual, fixture.expected[encoding], metadata);
          }
        }
      }
      assert.deepEqual(consoleCalls, []);
    } finally {
      globalThis.fetch = originals.fetch;
      http.get = originals.httpGet;
      http.request = originals.httpRequest;
      https.get = originals.httpsGet;
      https.request = originals.httpsRequest;
      net.connect = originals.netConnect;
      net.createConnection = originals.netCreateConnection;
      tls.connect = originals.tlsConnect;
      Object.assign(console, originals.console);
    }
  },
);
