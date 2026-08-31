import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserWorkerTokenCounter } from "../dist/adapters/browser-worker.js";

const PRIVATE_MARKER = "sk-test-private-worker-race-marker";

class ControlledWorker {
  static instances = [];

  listeners = new Map();
  posted = [];
  terminateCalls = 0;

  constructor(url, options) {
    this.url = url;
    this.options = options;
    ControlledWorker.instances.push(this);
    queueMicrotask(() => this.emit("message", { data: { ready: true } }));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message) {
    this.posted.push(message);
  }

  terminate() {
    this.terminateCalls += 1;
  }

  emit(type, event) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

const originalWorker = globalThis.Worker;

test.before(() => {
  globalThis.Worker = ControlledWorker;
});

test.after(() => {
  globalThis.Worker = originalWorker;
});

test.beforeEach(() => {
  ControlledWorker.instances.length = 0;
});

async function createCounter(initialRequestId = 0) {
  const counter = await createBrowserWorkerTokenCounter(
    new URL("https://local.invalid/controlled.worker.js"),
    "controlled-worker",
    initialRequestId,
  );
  const worker = ControlledWorker.instances.at(-1);
  assert.ok(worker);
  return { counter, worker };
}

function response(worker, id, count) {
  worker.emit("message", { data: { count, id, ok: true } });
}

async function rejectionMessage(promise) {
  try {
    await promise;
    assert.fail("Expected a content-free rejection.");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(`${error.message}\n${error.stack}`, new RegExp(PRIVATE_MARKER));
    return error.message;
  }
}

test("associates out-of-order responses with their own requests", async () => {
  const { counter, worker } = await createCounter();
  const pending = [counter.count("A"), counter.count("B"), counter.count("C")];
  assert.deepEqual(worker.posted.map(({ id }) => id), [0, 1, 2]);

  response(worker, 1, 20);
  response(worker, 0, 10);
  response(worker, 2, 30);

  assert.deepEqual(await Promise.all(pending), [10, 20, 30]);
  counter.close();
  assert.equal(worker.terminateCalls, 1);
});

test("duplicate and unknown responses fail without settling another request", async () => {
  const first = await createCounter();
  const resolved = first.counter.count(PRIVATE_MARKER);
  response(first.worker, 0, 7);
  assert.equal(await resolved, 7);
  first.worker.emit("message", { data: { count: 8, id: 0, ok: true } });
  assert.equal(
    await rejectionMessage(first.counter.count(PRIVATE_MARKER)),
    "Token counter worker failed.",
  );
  assert.equal(first.worker.terminateCalls, 1);

  const second = await createCounter();
  const pending = second.counter.count(PRIVATE_MARKER);
  second.worker.emit("message", { data: { count: 1, id: 99, ok: true } });
  assert.equal(await rejectionMessage(pending), "Token counter worker failed.");
  assert.equal(second.worker.terminateCalls, 1);
});

test("close rejects all pending work once and ignores late responses", async () => {
  const { counter, worker } = await createCounter();
  const pending = [
    counter.count(PRIVATE_MARKER),
    counter.count(PRIVATE_MARKER),
    counter.count(PRIVATE_MARKER),
  ];
  counter.close();
  counter.close();
  response(worker, 0, 1);
  response(worker, 1, 2);

  assert.deepEqual(
    await Promise.all(pending.map(rejectionMessage)),
    Array(3).fill("Token counter is closed."),
  );
  assert.equal(worker.terminateCalls, 1);
  assert.equal(
    await rejectionMessage(counter.count(PRIVATE_MARKER)),
    "Token counter is closed.",
  );
});

test("worker failure followed by close terminates once", async () => {
  const { counter, worker } = await createCounter();
  const pending = counter.count(PRIVATE_MARKER);
  const failureEvent = { preventDefaultCalls: 0, preventDefault() { this.preventDefaultCalls += 1; } };
  worker.emit("error", failureEvent);
  counter.close();
  counter.close();

  assert.equal(await rejectionMessage(pending), "Token counter worker failed.");
  assert.equal(worker.terminateCalls, 1);
  assert.equal(failureEvent.preventDefaultCalls, 1);
});

test("request ID exhaustion is deterministic and collision-free", async () => {
  const { counter, worker } = await createCounter(Number.MAX_SAFE_INTEGER);
  const finalSafeRequest = counter.count(PRIVATE_MARKER);
  assert.equal(worker.posted[0]?.id, Number.MAX_SAFE_INTEGER);
  assert.equal(
    await rejectionMessage(counter.count(PRIVATE_MARKER)),
    "Token counting failed.",
  );
  assert.equal(worker.posted.length, 1);
  response(worker, Number.MAX_SAFE_INTEGER, 42);
  assert.equal(await finalSafeRequest, 42);
  counter.close();
});

test("invalid request-ID seams fail before worker construction", async () => {
  assert.equal(
    await rejectionMessage(
      createBrowserWorkerTokenCounter(
        new URL("https://local.invalid/controlled.worker.js"),
        "controlled-worker",
        Number.MAX_SAFE_INTEGER + 1,
      ),
    ),
    "Token counter initialization failed.",
  );
  assert.equal(ControlledWorker.instances.length, 0);
});
