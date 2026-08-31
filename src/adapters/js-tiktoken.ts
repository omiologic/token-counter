import { getEncoding } from "js-tiktoken";

import type { TokenCounter, TokenEncoding } from "../token-counter.js";
import { withReferenceWhitespaceSemantics } from "./js-tiktoken-lite.js";

const UNSUPPORTED_ENCODING_MESSAGE = "Unsupported token encoding.";
const COUNT_FAILURE_MESSAGE = "Token counting failed.";

interface PatternMutableEncoder {
  encode(
    text: string,
    allowedSpecial: string[],
    disallowedSpecial: string[],
  ): number[];
  patStr: string;
}

/** A synchronous local counter backed by the audited js-tiktoken package. */
export class JsTiktokenCounter implements TokenCounter {
  readonly #encoder: PatternMutableEncoder;

  constructor(encoding: TokenEncoding) {
    try {
      const encoder = getEncoding(encoding) as unknown as PatternMutableEncoder;
      if (typeof encoder.patStr !== "string") {
        throw new Error(UNSUPPORTED_ENCODING_MESSAGE);
      }
      // This audited field is private to the pinned dependency integration and
      // must never enter the application-owned declaration surface.
      encoder.patStr = withReferenceWhitespaceSemantics(encoder.patStr);
      this.#encoder = encoder;
    } catch {
      // Do not let dependency errors or caller-provided values cross the boundary.
      throw new Error(UNSUPPORTED_ENCODING_MESSAGE);
    }
  }

  count(text: string): number {
    try {
      // Treat special-token text as ordinary input. Dependency-level rejection
      // includes matched input content in its error message.
      return this.#encoder.encode(text, [], []).length;
    } catch {
      // Never expose dependency diagnostics that could contain input text.
      throw new Error(COUNT_FAILURE_MESSAGE);
    }
  }
}
