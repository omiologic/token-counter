import { createBrowserWorkerTokenCounter } from "../adapters/browser-worker.js";
import type { BrowserWorkerTokenCounter } from "../async-token-counter.js";

export type {
  AsyncTokenCounter,
  BrowserWorkerTokenCounter,
} from "../async-token-counter.js";

/** Creates a ready, caller-owned o200k_base browser-worker counter. */
export function createTokenCounter(): Promise<BrowserWorkerTokenCounter> {
  return createBrowserWorkerTokenCounter(
    new URL("./o200k_base.worker.js", import.meta.url),
    "@omiologic/token-counter:o200k_base",
  );
}
