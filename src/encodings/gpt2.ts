import gpt2 from "js-tiktoken/ranks/gpt2";

import { createJsTiktokenLiteCounter } from "../adapters/js-tiktoken-lite.js";
import type { TokenCounter } from "../token-counter.js";

/** Creates a local counter containing only the gpt2 encoding payload. */
export function createTokenCounter(): TokenCounter {
  return createJsTiktokenLiteCounter(gpt2);
}
