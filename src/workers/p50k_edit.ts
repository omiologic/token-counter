import { createBrowserWorkerTokenCounter } from "../adapters/browser-worker.js";
import type { BrowserWorkerTokenCounter } from "../async-token-counter.js";

export type {
  AsyncTokenCounter,
  BrowserWorkerTokenCounter,
} from "../async-token-counter.js";

/** Creates a ready, caller-owned p50k_edit browser-worker counter. */
export function createTokenCounter(): Promise<BrowserWorkerTokenCounter> {
  return createBrowserWorkerTokenCounter(
    new URL("./p50k_edit.worker.js", import.meta.url),
    "@omiologic/token-counter:p50k_edit",
  );
}
