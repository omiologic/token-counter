import {
  DEFAULT_FUZZ_SEED,
  ENCODINGS,
  FAST_FUZZ_CASES,
  generateFuzzCorpus,
} from "./generator.mjs";
import { assertFuzzCount, formatFuzzSummary } from "./safety.mjs";
import { createSyncFuzzCounters } from "./sync-surfaces.mjs";

export const DEFAULT_FUZZ_COUNT_TOTALS = Object.freeze({
  cl100k_base: 21591,
  gpt2: 23732,
  o200k_base: 19787,
  p50k_base: 23729,
  p50k_edit: 23729,
  r50k_base: 23732,
});

export function runSyncFuzzParity({
  seed = DEFAULT_FUZZ_SEED,
  cases = FAST_FUZZ_CASES,
} = {}) {
  const corpus = generateFuzzCorpus({ seed, cases });
  let checks = 0;
  const countTotals = {};

  for (const encoding of ENCODINGS) {
    const counters = createSyncFuzzCounters(encoding);
    let countTotal = 0;
    for (const fuzzCase of corpus) {
      const expected = counters[0][1].count(fuzzCase.text);
      countTotal += expected;
      for (const [surface, counter] of counters) {
        const actual = counter.count(fuzzCase.text);
        assertFuzzCount({ fuzzCase, encoding, surface, expected, actual });
        checks += 1;
      }
    }
    countTotals[encoding] = countTotal;
    if (
      corpus[0].seed === DEFAULT_FUZZ_SEED &&
      corpus.length === FAST_FUZZ_CASES &&
      countTotal !== DEFAULT_FUZZ_COUNT_TOTALS[encoding]
    ) {
      throw new Error(
        [
          "Fuzz sequence mismatch:",
          "seed=0x5eedc0de",
          "cases=48",
          `encoding=${encoding}`,
          `expected=${DEFAULT_FUZZ_COUNT_TOTALS[encoding]}`,
          `actual=${countTotal}`,
        ].join(" "),
      );
    }
  }

  return Object.freeze({
    cases: corpus.length,
    checks,
    countTotals: Object.freeze(countTotals),
    seed: corpus[0].seed,
    summary: formatFuzzSummary({
      seed: corpus[0].seed,
      cases: corpus.length,
      checks,
      label: "fuzz-sync-ok",
    }),
  });
}
