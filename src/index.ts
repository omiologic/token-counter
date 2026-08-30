import { JsTiktokenCounter } from "./adapters/js-tiktoken.js";
import { resolveTokenEncoding } from "./registry.js";

import type {
  TokenCounter,
  TokenCounterDescriptor,
} from "./token-counter.js";

export { JsTiktokenCounter, resolveTokenEncoding };
export type {
  TokenCounter,
  TokenCounterDescriptor,
  TokenEncoding,
} from "./token-counter.js";

/** Creates the audited local JavaScript counter selected by a descriptor. */
export function createTokenCounter(
  descriptor: TokenCounterDescriptor,
): TokenCounter {
  return new JsTiktokenCounter(resolveTokenEncoding(descriptor));
}
