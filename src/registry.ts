import type {
  TokenCounterDescriptor,
  TokenEncoding,
} from "./token-counter.js";

const UNSUPPORTED_SELECTION_MESSAGE =
  "Unsupported token counter selection. Provide a supported encoding or provider/model pair.";

const SUPPORTED_ENCODINGS: ReadonlySet<string> = new Set([
  "cl100k_base",
  "gpt2",
  "o200k_base",
  "p50k_base",
  "p50k_edit",
  "r50k_base",
]);

// This intentionally small catalog is pinned to mappings reviewed with the
// audited js-tiktoken 1.0.21 package. It contains counting metadata only.
const MODEL_MAPPINGS = [
  { provider: "openai", model: "gpt-4", encoding: "cl100k_base" },
  { provider: "openai", model: "gpt-4.1", encoding: "o200k_base" },
  { provider: "openai", model: "gpt-4o", encoding: "o200k_base" },
  { provider: "openai", model: "gpt-4o-mini", encoding: "o200k_base" },
] as const satisfies readonly {
  provider: string;
  model: string;
  encoding: TokenEncoding;
}[];

const MODEL_ENCODING_BY_KEY = new Map<string, TokenEncoding>();

for (const mapping of MODEL_MAPPINGS) {
  const key = modelKey(mapping.provider, mapping.model);
  if (MODEL_ENCODING_BY_KEY.has(key)) {
    throw new Error("Duplicate token counter model mapping.");
  }
  MODEL_ENCODING_BY_KEY.set(key, mapping.encoding);
}

function modelKey(provider: string, model: string): string {
  return `${provider}\u0000${model}`;
}

function isSupportedEncoding(value: unknown): value is TokenEncoding {
  return typeof value === "string" && SUPPORTED_ENCODINGS.has(value);
}

function unsupportedSelection(): never {
  throw new Error(UNSUPPORTED_SELECTION_MESSAGE);
}

/**
 * Resolves a descriptor to one locally bundled encoding.
 *
 * An explicit encoding is authoritative and takes precedence over provider and
 * model hints. A fallback is used only when no explicit encoding is present and
 * an exact provider/model mapping cannot be resolved. All identifiers are
 * case-sensitive; unsupported values fail without being echoed.
 */
export function resolveTokenEncoding(
  descriptor: TokenCounterDescriptor,
): TokenEncoding {
  if (descriptor === null || typeof descriptor !== "object") {
    return unsupportedSelection();
  }

  const candidate = descriptor as Record<string, unknown>;

  if (candidate.encoding !== undefined) {
    return isSupportedEncoding(candidate.encoding)
      ? candidate.encoding
      : unsupportedSelection();
  }

  if (
    typeof candidate.provider === "string" &&
    typeof candidate.model === "string"
  ) {
    const mapped = MODEL_ENCODING_BY_KEY.get(
      modelKey(candidate.provider, candidate.model),
    );
    if (mapped !== undefined) {
      return mapped;
    }
  }

  if (candidate.fallbackEncoding !== undefined) {
    return isSupportedEncoding(candidate.fallbackEncoding)
      ? candidate.fallbackEncoding
      : unsupportedSelection();
  }

  return unsupportedSelection();
}
