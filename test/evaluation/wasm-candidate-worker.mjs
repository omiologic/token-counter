import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import tls from "node:tls";
import { pathToFileURL } from "node:url";

import { materializeFixture } from "../fixtures/materialize.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const adapter = process.argv[2];
const candidateRoot = resolve(process.argv[3] ?? ".");
const fixtureData = JSON.parse(
  readFileSync(new URL("../fixtures/token-counts.json", import.meta.url), "utf8"),
);
const BENCHMARK_FIXTURES = fixtureData.fixtures.filter(({ id }) =>
  ["large-repeated", "large-nonrepeated"].includes(id),
);
const ITERATIONS = 10;
const WARMUP_ITERATIONS = 3;

if (!adapter || !["js", "wasm"].includes(adapter)) {
  throw new Error("Expected a js or wasm adapter selector.");
}

function denyNetwork() {
  throw new Error("network access denied by evaluation");
}

function installRuntimeGuards() {
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
  return () => {
    globalThis.fetch = originals.fetch;
    http.get = originals.httpGet;
    http.request = originals.httpRequest;
    https.get = originals.httpsGet;
    https.request = originals.httpsRequest;
    net.connect = originals.netConnect;
    net.createConnection = originals.netCreateConnection;
    tls.connect = originals.tlsConnect;
  };
}

function installConsoleGuard() {
  let calls = 0;
  const originals = {};
  for (const method of ["debug", "error", "info", "log", "warn"]) {
    originals[method] = console[method];
    console[method] = () => {
      calls += 1;
    };
  }
  return {
    calls: () => calls,
    restore: () => Object.assign(console, originals),
  };
}

function memorySnapshot() {
  globalThis.gc?.();
  const usage = process.memoryUsage();
  return {
    array_buffers_bytes: usage.arrayBuffers,
    external_bytes: usage.external,
    heap_used_bytes: usage.heapUsed,
    rss_bytes: usage.rss,
  };
}

function memoryDelta(before, after) {
  return Object.fromEntries(
    Object.keys(before).map((key) => [key, after[key] - before[key]]),
  );
}

function contentSafeCounter(count, close = () => undefined) {
  return {
    close,
    count(text) {
      try {
        return count(text);
      } catch {
        throw new Error("Token counting failed.");
      }
    },
  };
}

async function initializeJsCounter() {
  const module = await import(
    pathToFileURL(resolve(ROOT, "dist/encodings/o200k_base.js")).href
  );
  const counter = module.createTokenCounter();
  return contentSafeCounter((text) => counter.count(text));
}

async function initializeWasmCounter(encoding = "o200k_base") {
  const require = createRequire(import.meta.url);
  const api = require(resolve(candidateRoot, "lite/init.cjs"));
  const ranks = require(resolve(candidateRoot, `encoders/${encoding}.cjs`));
  const bytes = readFileSync(resolve(candidateRoot, "lite/tiktoken_bg.wasm"));
  await api.init((imports) => WebAssembly.instantiate(bytes, imports));
  const encoder = new api.Tiktoken(
    ranks.bpe_ranks,
    ranks.special_tokens,
    ranks.pat_str,
  );
  return contentSafeCounter(
    (text) => encoder.encode(text, [], []).length,
    () => encoder.free(),
  );
}

function verifyPublicOutput(counter) {
  const privateMarker = "private-wasm-evaluation-marker";
  const result = counter.count(privateMarker);
  if (!Number.isInteger(result)) {
    throw new Error("Counter returned a non-integer result.");
  }
  try {
    counter.count({ privateMarker });
    throw new Error("Counter accepted a non-string value.");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "Token counting failed." ||
      error.message.includes(privateMarker)
    ) {
      throw new Error("Counter exposed a content-bearing failure.");
    }
  }
}

function verifyEncoding(counter, encoding) {
  let checks = 0;
  for (const fixture of fixtureData.fixtures) {
    const actual = counter.count(materializeFixture(fixture.input));
    if (actual !== fixture.expected[encoding]) {
      throw new Error(`Parity failed for ${encoding}/${fixture.id}.`);
    }
    checks += 1;
  }
  return checks;
}

function benchmark(counter) {
  const measurements = [];
  for (const fixture of BENCHMARK_FIXTURES) {
    const text = materializeFixture(fixture.input);
    for (let index = 0; index < WARMUP_ITERATIONS; index += 1) {
      counter.count(text);
    }
    const started = performance.now();
    let lastCount = 0;
    for (let index = 0; index < ITERATIONS; index += 1) {
      lastCount = counter.count(text);
    }
    const elapsed = performance.now() - started;
    if (lastCount !== fixture.expected.o200k_base) {
      throw new Error(`Benchmark parity failed for ${fixture.id}.`);
    }
    measurements.push({
      bytes: Buffer.byteLength(text),
      fixture_id: fixture.id,
      iterations: ITERATIONS,
      milliseconds_per_count: elapsed / ITERATIONS,
      tokens: lastCount,
    });
  }
  return measurements;
}

const restoreRuntime = installRuntimeGuards();
const consoleGuard = installConsoleGuard();
let counter;

try {
  const memoryBefore = memorySnapshot();
  const initializedAt = performance.now();
  counter =
    adapter === "js"
      ? await initializeJsCounter()
      : await initializeWasmCounter();
  const initializationMilliseconds = performance.now() - initializedAt;
  const memoryAfterInitialization = memorySnapshot();

  verifyPublicOutput(counter);
  let parityChecks = verifyEncoding(counter, "o200k_base");
  const measurements = benchmark(counter);
  const memoryAfterBenchmark = memorySnapshot();

  if (adapter === "wasm") {
    counter.close();
    counter = undefined;
    for (const encoding of fixtureData.encodings.filter(
      (value) => value !== "o200k_base",
    )) {
      const encodingCounter = await initializeWasmCounter(encoding);
      parityChecks += verifyEncoding(encodingCounter, encoding);
      encodingCounter.close();
    }
  }

  if (consoleGuard.calls() !== 0) {
    throw new Error("Candidate emitted console output.");
  }

  const result = {
    adapter,
    initialization_milliseconds: initializationMilliseconds,
    max_rss_kib: process.resourceUsage().maxRSS,
    memory_after_benchmark_bytes: memoryDelta(
      memoryBefore,
      memoryAfterBenchmark,
    ),
    memory_after_initialization_bytes: memoryDelta(
      memoryBefore,
      memoryAfterInitialization,
    ),
    parity_checks: parityChecks,
    steady_state: measurements,
  };
  consoleGuard.restore();
  restoreRuntime();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  counter?.close();
  consoleGuard.restore();
  restoreRuntime();
}
