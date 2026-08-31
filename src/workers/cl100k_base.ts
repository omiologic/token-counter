import { createBrowserWorkerTokenCounter } from "../adapters/browser-worker.js";
import type { BrowserWorkerTokenCounter } from "../async-token-counter.js";

export type {
  AsyncTokenCounter,
  BrowserWorkerTokenCounter,
} from "../async-token-counter.js";

/** Creates a ready, caller-owned cl100k_base browser-worker counter. */
export function createTokenCounter(): Promise<BrowserWorkerTokenCounter> {
  return createBrowserWorkerTokenCounter(
    new URL("./cl100k_base.worker.js", import.meta.url),
    "@omiologic/token-counter:cl100k_base",
  );
}
