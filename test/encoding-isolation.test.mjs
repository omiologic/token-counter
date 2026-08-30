import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import test from "node:test";
import tls from "node:tls";

import { IsolatedCl100kCounter } from "./encoding-isolation-poc.mjs";
import { materializeFixture } from "./fixtures/materialize.mjs";

const fixtureData = JSON.parse(
  await readFile(new URL("./fixtures/token-counts.json", import.meta.url), "utf8"),
);

function denyNetwork() {
  throw new Error("network access denied by test");
}

test(
  "isolated cl100k proof matches fixtures with runtime network denied",
  { timeout: 120_000 },
  () => {
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
      const counter = new IsolatedCl100kCounter();
      for (const fixture of fixtureData.fixtures) {
        assert.equal(
          counter.count(materializeFixture(fixture.input)),
          fixture.expected.cl100k_base,
          fixture.id,
        );
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

test("isolated proof keeps output and failures content-safe", () => {
  const counter = new IsolatedCl100kCounter();
  const privateInput = "private-isolated-input-marker";
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
    const result = counter.count(privateInput);
    assert.equal(typeof result, "number");
    assert.equal(Number.isInteger(result), true);
    assert.deepEqual(calls, []);
    assert.throws(
      () => counter.count({ privateInput }),
      (error) =>
        error instanceof Error &&
        error.message === "Token counting failed." &&
        !error.message.includes(privateInput),
    );
  } finally {
    Object.assign(console, originalMethods);
  }
});
