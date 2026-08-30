import o200kBase from "js-tiktoken/ranks/o200k_base";

import { createJsTiktokenLiteCounter } from "../adapters/js-tiktoken-lite.js";
import type { TokenCounter } from "../token-counter.js";

/** Creates a local counter containing only the o200k_base encoding payload. */
export function createTokenCounter(): TokenCounter {
  return createJsTiktokenLiteCounter(o200kBase);
}
