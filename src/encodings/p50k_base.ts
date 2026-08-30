import p50kBase from "js-tiktoken/ranks/p50k_base";

import { createJsTiktokenLiteCounter } from "../adapters/js-tiktoken-lite.js";
import type { TokenCounter } from "../token-counter.js";

/** Creates a local counter containing only the p50k_base encoding payload. */
export function createTokenCounter(): TokenCounter {
  return createJsTiktokenLiteCounter(p50kBase);
}
