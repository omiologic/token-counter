import { Tiktoken } from "js-tiktoken/lite";

import type { TokenCounter } from "../token-counter.js";

const INITIALIZATION_FAILURE_MESSAGE = "Token counter initialization failed.";
const COUNT_FAILURE_MESSAGE = "Token counting failed.";

interface LocalEncodingRanks {
  bpe_ranks: string;
  pat_str: string;
  special_tokens: Record<string, number>;
}

class JsTiktokenLiteCounter implements TokenCounter {
  readonly #encoder: Tiktoken;

  constructor(ranks: LocalEncodingRanks) {
    this.#encoder = new Tiktoken(ranks);
  }

  count(text: string): number {
    try {
      return this.#encoder.encode(text, [], []).length;
    } catch {
      throw new Error(COUNT_FAILURE_MESSAGE);
    }
  }
}

/** Creates an internal counter from one statically bundled encoding payload. */
export function createJsTiktokenLiteCounter(
  ranks: LocalEncodingRanks,
): TokenCounter {
  try {
    return new JsTiktokenLiteCounter(ranks);
  } catch {
    throw new Error(INITIALIZATION_FAILURE_MESSAGE);
  }
}
