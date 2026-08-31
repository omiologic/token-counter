import { parseFuzzArguments } from "./fuzz/cli.mjs";
import {
  DEFAULT_FUZZ_SEED,
  generateFuzzCase,
} from "./fuzz/generator.mjs";
import { fuzzCaseMetadata } from "./fuzz/safety.mjs";
import { createSyncFuzzCounters } from "./fuzz/sync-surfaces.mjs";

const options = parseFuzzArguments(process.argv.slice(2), {
  requireCase: true,
  requireEncoding: true,
});
const fuzzCase = generateFuzzCase(
  options.seed ?? DEFAULT_FUZZ_SEED,
  options.caseIndex,
);
const counts = Object.fromEntries(
  createSyncFuzzCounters(options.encoding).map(([surface, counter]) => [
    surface,
    counter.count(fuzzCase.text),
  ]),
);
const metadata = fuzzCaseMetadata({
  fuzzCase,
  encoding: options.encoding,
  surface: "root/js/isolated",
});

process.stdout.write(
  [
    "fuzz-case-ok",
    `seed=${metadata.seed}`,
    `case=${metadata.caseIndex}`,
    `encoding=${metadata.encoding}`,
    `utf16_length=${metadata.utf16Length}`,
    `utf8_bytes=${metadata.utf8Bytes}`,
    `root=${counts.root}`,
    `js=${counts.js}`,
    `isolated=${counts.isolated}`,
  ].join(" ") + "\n",
);
