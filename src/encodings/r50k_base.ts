import r50kBase from "js-tiktoken/ranks/r50k_base";

import { createJsTiktokenLiteCounter } from "../adapters/js-tiktoken-lite.js";
import type { TokenCounter } from "../token-counter.js";

/** Creates a local counter containing only the r50k_base encoding payload. */
export function createTokenCounter(): TokenCounter {
  return createJsTiktokenLiteCounter(r50kBase);
}
