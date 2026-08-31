import { createTokenCounter } from "../../dist/encodings/o200k_base.js";

const consoleMethods = ["debug", "error", "info", "log", "warn"];
let consoleCalls = 0;
for (const method of consoleMethods) {
  console[method] = () => {
    consoleCalls += 1;
  };
}

const deny = () => {
  throw new Error("Runtime capability denied by evaluation.");
};

globalThis.fetch = deny;
if (globalThis.XMLHttpRequest) globalThis.XMLHttpRequest.prototype.open = deny;
globalThis.WebSocket = deny;
globalThis.EventSource = deny;
if (globalThis.Navigator?.prototype?.sendBeacon) {
  globalThis.Navigator.prototype.sendBeacon = deny;
}
if (globalThis.Storage?.prototype?.setItem) {
  globalThis.Storage.prototype.setItem = deny;
}
if (globalThis.indexedDB?.open) globalThis.indexedDB.open = deny;
if (globalThis.caches?.open) globalThis.caches.open = deny;

const counter = createTokenCounter();
const memory = () => performance.memory?.usedJSHeapSize ?? null;

globalThis.addEventListener("message", (event) => {
  let text;
  try {
    const id = Number.isInteger(event.data?.id) ? event.data.id : -1;
    if (event.data?.operation === "count") {
      text = event.data.text;
      if (typeof text !== "string") throw new Error("Invalid input.");
      const started = performance.now();
      const count = counter.count(text);
      const countingMilliseconds = performance.now() - started;
      text = undefined;
      globalThis.postMessage({
        count,
        counting_milliseconds: countingMilliseconds,
        id,
        ok: true,
      });
      return;
    }
    if (event.data?.operation === "metrics") {
      globalThis.postMessage({
        console_calls: consoleCalls,
        id,
        memory_bytes: memory(),
        ok: true,
      });
      return;
    }
    throw new Error("Unknown operation.");
  } catch {
    text = undefined;
    globalThis.postMessage({
      error: "Token counting failed.",
      id: Number.isInteger(event.data?.id) ? event.data.id : -1,
      ok: false,
    });
  }
});

globalThis.postMessage({
  console_calls: consoleCalls,
  memory_bytes: memory(),
  ready: true,
});
