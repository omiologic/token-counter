/** Encoding names backed by locally bundled data in the audited adapter. */
export type TokenEncoding =
  | "cl100k_base"
  | "gpt2"
  | "o200k_base"
  | "p50k_base"
  | "p50k_edit"
  | "r50k_base";

/** Inputs for deterministic local counter selection. */
export interface TokenCounterDescriptor {
  /** Explicit selection. When present, this takes precedence over every hint. */
  encoding?: TokenEncoding;
  /** Explicit caller-owned fallback used only when provider/model selection fails. */
  fallbackEncoding?: TokenEncoding;
  /** Exact, case-sensitive provider identifier used with `model`. */
  provider?: string;
  /** Exact, case-sensitive model identifier used with `provider`. */
  model?: string;
}

/** A synchronous, implementation-independent local token counter. */
export interface TokenCounter {
  count(text: string): number;
}
