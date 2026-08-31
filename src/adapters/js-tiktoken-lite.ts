import { Tiktoken } from "js-tiktoken/lite";

import type { TokenCounter } from "../token-counter.js";

const INITIALIZATION_FAILURE_MESSAGE = "Token counter initialization failed.";
const COUNT_FAILURE_MESSAGE = "Token counting failed.";

interface LocalEncodingRanks {
  bpe_ranks: string;
  pat_str: string;
  special_tokens: Record<string, number>;
}

export function withReferenceWhitespaceSemantics(pattern: string): string {
  // JavaScript's `\s` differs from the Unicode White_Space set used by the
  // pinned reference regex engine: it omits U+0085 and includes U+FEFF.
  const whitespaceUnits =
    "\\u0009-\\u000d\\u0020\\u0085\\u00a0\\u1680" +
    "\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
  let insideCharacterClass = false;
  let compatiblePattern = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const next = pattern[index + 1];
    if (character === "\\") {
      if (next !== "s" && next !== "S") {
        compatiblePattern += character + (next ?? "");
        index += next === undefined ? 0 : 1;
        continue;
      }
      if (next === "S" && insideCharacterClass) {
        throw new Error("Unsupported tokenizer pattern.");
      }
      if (next === "s") {
        compatiblePattern += insideCharacterClass
          ? whitespaceUnits
          : `[${whitespaceUnits}]`;
      } else {
        compatiblePattern += `[^${whitespaceUnits}]`;
      }
      index += 1;
      continue;
    }
    if (character === "[") insideCharacterClass = true;
    if (character === "]") insideCharacterClass = false;
    compatiblePattern += character;
  }

  if (insideCharacterClass) throw new Error("Unsupported tokenizer pattern.");
  return compatiblePattern;
}

class JsTiktokenLiteCounter implements TokenCounter {
  readonly #encoder: Tiktoken;

  constructor(ranks: LocalEncodingRanks) {
    this.#encoder = new Tiktoken({
      ...ranks,
      pat_str: withReferenceWhitespaceSemantics(ranks.pat_str),
    });
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
