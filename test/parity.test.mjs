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
  "matches trusted counts for every encoding with runtime network denied",
  { timeout: 120_000 },
  async () => {
    const originals = {
      fetch: globalThis.fetch,
      httpGet: http.get,
      httpRequest: http.request,
      httpsGet: https.get,
      httpsRequest: https.request,
      netConnect: net.connect,
      netCreateConnection: net.createConnection,
      tlsConnect: tls.connect,
    };

    globalThis.fetch = denyNetwork;
    http.get = denyNetwork;
    http.request = denyNetwork;
    https.get = denyNetwork;
    https.request = denyNetwork;
    net.connect = denyNetwork;
    net.createConnection = denyNetwork;
    tls.connect = denyNetwork;

    try {
      const { JsTiktokenCounter } = await import("../dist/index.js");

      for (const encoding of fixtureData.encodings) {
        const counter = new JsTiktokenCounter(encoding);

        for (const fixture of fixtureData.fixtures) {
          const text = materializeFixture(fixture.input);
          const byteLength = new TextEncoder().encode(text).byteLength;
          assert.equal(byteLength <= MAX_FIXTURE_BYTES, true, fixture.id);

          const actual = counter.count(text);
          assert.equal(typeof actual, "number", fixture.id);
          assert.equal(Number.isInteger(actual), true, fixture.id);
          assert.equal(actual, fixture.expected[encoding], fixture.id);
        }
      }
    } finally {
      globalThis.fetch = originals.fetch;
      http.get = originals.httpGet;
      http.request = originals.httpRequest;
      https.get = originals.httpsGet;
      https.request = originals.httpsRequest;
      net.connect = originals.netConnect;
      net.createConnection = originals.netCreateConnection;
      tls.connect = originals.tlsConnect;
    }
  },
);
