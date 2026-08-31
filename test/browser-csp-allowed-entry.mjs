import { count as syncCount } from "./evaluation/browser-worker-main.mjs";
import { createTokenCounter } from "../dist/workers/o200k_base.js";

let consoleCalls = 0;
for (const method of ["debug", "error", "info", "log", "warn"]) {
  console[method] = () => { consoleCalls += 1; };
}

let counter;
try {
  counter = await createTokenCounter();
  const privateMarker = "csp-allowed-private-marker";
  const expected = syncCount(privateMarker);
  const actual = await counter.count(privateMarker);
  if (!Number.isSafeInteger(actual) || actual !== expected || consoleCalls !== 0) {
    throw new Error("Allowed CSP verification failed.");
  }
  counter.close();
  globalThis.location.replace("/__csp_passed__?suite=allowed");
} catch {
  counter?.close();
  globalThis.location.replace("/__csp_failed__?suite=allowed");
}
