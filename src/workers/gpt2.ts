import { createBrowserWorkerTokenCounter } from "../adapters/browser-worker.js";
import type { BrowserWorkerTokenCounter } from "../async-token-counter.js";

export type {
  AsyncTokenCounter,
  BrowserWorkerTokenCounter,
} from "../async-token-counter.js";

/** Creates a ready, caller-owned gpt2 browser-worker counter. */
export function createTokenCounter(): Promise<BrowserWorkerTokenCounter> {
  return createBrowserWorkerTokenCounter(
    new URL("./gpt2.worker.js", import.meta.url),
    "@omiologic/token-counter:gpt2",
  );
}
