import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { JsTiktokenCounter } from "@omiologic/token-counter/js";

import { parseFuzzArguments } from "./fuzz/cli.mjs";
import {
  DEFAULT_FUZZ_SEED,
  ENCODINGS,
  REFERENCE_FUZZ_CASES,
  generateFuzzCorpus,
} from "./fuzz/generator.mjs";
import { assertFuzzCount, formatFuzzSummary } from "./fuzz/safety.mjs";

const DEFAULT_PYTHON = "/tmp/token-counter-reference/bin/python";
const options = parseFuzzArguments(process.argv.slice(2), {
  defaultCases: REFERENCE_FUZZ_CASES,
  defaultPython: DEFAULT_PYTHON,
});
const seed = options.seed ?? DEFAULT_FUZZ_SEED;
const startCase = options.caseIndex ?? 0;
const corpus = generateFuzzCorpus({ seed, cases: options.cases, startCase });
const reference = await runReference({
  python: options.python,
  seed,
  startCase,
  cases: corpus.length,
});

if (
  reference.version !== "0.14.0" ||
  reference.seed !== seed ||
  reference.startCase !== startCase ||
  reference.cases !== corpus.length ||
  !Array.isArray(reference.records) ||
  reference.records.length !== corpus.length
) {
  throw new Error("Invalid fuzz reference result metadata.");
}

let checks = 0;
const mismatchMessages = [];
const mismatchCounts = Object.fromEntries(ENCODINGS.map((encoding) => [encoding, 0]));
const counters = Object.fromEntries(
  ENCODINGS.map((encoding) => [encoding, new JsTiktokenCounter(encoding)]),
);
for (const [offset, fuzzCase] of corpus.entries()) {
  const record = reference.records[offset];
  if (record?.case !== fuzzCase.caseIndex || typeof record.counts !== "object") {
    throw new Error("Invalid fuzz reference case metadata.");
  }
  for (const encoding of ENCODINGS) {
    const expected = record.counts[encoding];
    if (!Number.isSafeInteger(expected) || expected < 0) {
      throw new Error("Invalid fuzz reference count metadata.");
    }
    const actual = counters[encoding].count(fuzzCase.text);
    try {
      assertFuzzCount({
        fuzzCase,
        encoding,
        surface: "python-reference",
        expected,
        actual,
      });
    } catch (error) {
      mismatchMessages.push(error.message);
      mismatchCounts[encoding] += 1;
    }
    checks += 1;
  }
}

if (mismatchMessages.length > 0) {
  const displayed = mismatchMessages.slice(0, 24);
  const omitted = mismatchMessages.length - displayed.length;
  const suffix = omitted === 0 ? "" : `\nomitted_mismatches=${omitted}`;
  const byEncoding = ENCODINGS.map(
    (encoding) => `${encoding}:${mismatchCounts[encoding]}`,
  ).join(",");
  throw new Error(
    `Fuzz reference mismatches: total=${mismatchMessages.length} ` +
      `by_encoding=${byEncoding}\n${displayed.join("\n")}${suffix}`,
  );
}

process.stdout.write(
  formatFuzzSummary({
    seed,
    cases: corpus.length,
    checks,
    label: "fuzz-reference-ok version=0.14.0",
  }) + ` start_case=${startCase}\n`,
);

async function runReference({ python, seed, startCase, cases }) {
  const script = fileURLToPath(
    new URL("./reference/fuzz_reference.py", import.meta.url),
  );
  const child = spawn(
    python,
    [
      script,
      "--seed",
      String(seed),
      "--start-case",
      String(startCase),
      "--cases",
      String(cases),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`Fuzz reference process failed with code ${exitCode}: ${stderr.trim()}`);
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("Fuzz reference process returned invalid JSON.");
  }
}
