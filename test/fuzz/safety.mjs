import { formatFuzzSeed } from "./generator.mjs";

const textEncoder = new TextEncoder();

export function fuzzCaseMetadata({ fuzzCase, encoding, surface }) {
  return Object.freeze({
    seed: formatFuzzSeed(fuzzCase.seed),
    caseIndex: fuzzCase.caseIndex,
    encoding,
    surface,
    utf16Length: fuzzCase.text.length,
    utf8Bytes: textEncoder.encode(fuzzCase.text).byteLength,
  });
}

export function assertFuzzCount({ fuzzCase, encoding, surface, expected, actual }) {
  if (actual === expected) return;
  const metadata = fuzzCaseMetadata({ fuzzCase, encoding, surface });
  throw new Error(
    [
      "Fuzz mismatch:",
      `seed=${metadata.seed}`,
      `case=${metadata.caseIndex}`,
      `encoding=${metadata.encoding}`,
      `surface=${metadata.surface}`,
      `utf16_length=${metadata.utf16Length}`,
      `utf8_bytes=${metadata.utf8Bytes}`,
      `expected=${expected}`,
      `actual=${actual}`,
    ].join(" "),
  );
}

export function formatFuzzSummary({ seed, cases, checks, label }) {
  return `${label} seed=${formatFuzzSeed(seed)} cases=${cases} checks=${checks}`;
}
