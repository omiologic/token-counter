import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import test from "node:test";
import tls from "node:tls";

function denyNetwork() {
  throw new Error("network access denied by test");
}

test("initializes and counts using only bundled data", async () => {
  const originalFetch = globalThis.fetch;
  const originalHttpRequest = http.request;
  const originalHttpGet = http.get;
  const originalHttpsRequest = https.request;
  const originalHttpsGet = https.get;
  const originalNetConnect = net.connect;
  const originalNetCreateConnection = net.createConnection;
  const originalTlsConnect = tls.connect;

  globalThis.fetch = denyNetwork;
  http.request = denyNetwork;
  http.get = denyNetwork;
  https.request = denyNetwork;
  https.get = denyNetwork;
  net.connect = denyNetwork;
  net.createConnection = denyNetwork;
  tls.connect = denyNetwork;

  try {
    const { JsTiktokenCounter } = await import("../dist/index.js");
    const counter = new JsTiktokenCounter("cl100k_base");

    assert.equal(counter.count("hello world"), 2);
  } finally {
    globalThis.fetch = originalFetch;
    http.request = originalHttpRequest;
    http.get = originalHttpGet;
    https.request = originalHttpsRequest;
    https.get = originalHttpsGet;
    net.connect = originalNetConnect;
    net.createConnection = originalNetCreateConnection;
    tls.connect = originalTlsConnect;
  }
});

test("returns deterministic numeric counts without logging input", async () => {
  const { JsTiktokenCounter } = await import("../dist/index.js");
  const counter = new JsTiktokenCounter("cl100k_base");
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
    assert.equal(counter.count(""), 0);
    const first = counter.count("deterministic fixture");
    const second = counter.count("deterministic fixture");

    assert.equal(typeof first, "number");
    assert.equal(Number.isInteger(first), true);
    assert.equal(first, second);
    assert.deepEqual(calls, []);
  } finally {
    Object.assign(console, originalMethods);
  }
});

test("treats special-token markers as ordinary text", async () => {
  const { JsTiktokenCounter } = await import("../dist/index.js");
  const counter = new JsTiktokenCounter("cl100k_base");
  const count = counter.count("prefix <|endoftext|> suffix");

  assert.equal(Number.isInteger(count), true);
  assert.equal(count > 0, true);
});

test("does not echo an unsupported encoding", async () => {
  const { JsTiktokenCounter } = await import("../dist/index.js");
  const privateValue = "sensitive-encoding-marker";

  assert.throws(
    () => new JsTiktokenCounter(privateValue),
    (error) => {
      assert.equal(error instanceof Error, true);
      assert.equal(error.message, "Unsupported token encoding.");
      assert.equal(error.message.includes(privateValue), false);
      return true;
    },
  );
});

test("replaces dependency failures with a content-free error", async () => {
  const { JsTiktokenCounter } = await import("../dist/index.js");
  const privateValue = "sensitive-input-marker";
  const counter = new JsTiktokenCounter("cl100k_base");

  assert.throws(
    () => counter.count({ privateValue }),
    (error) => {
      assert.equal(error instanceof Error, true);
      assert.equal(error.message, "Token counting failed.");
      assert.equal(error.message.includes(privateValue), false);
      return true;
    },
  );
});
