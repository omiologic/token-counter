import cl100kBase from "js-tiktoken/ranks/cl100k_base";

import { createJsTiktokenLiteCounter } from "../adapters/js-tiktoken-lite.js";
import type { TokenCounter } from "../token-counter.js";

/** Creates a local counter containing only the cl100k_base encoding payload. */
export function createTokenCounter(): TokenCounter {
  return createJsTiktokenLiteCounter(cl100kBase);
}
