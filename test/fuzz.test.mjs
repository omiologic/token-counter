import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_FUZZ_SEED,
  FAST_FUZZ_CASES,
  FUZZ_CATEGORIES,
  FUZZ_SIZE_BANDS,
  generateFuzzCase,
  generateFuzzCorpus,
} from "./fuzz/generator.mjs";
import { assertFuzzCount } from "./fuzz/safety.mjs";
import {
  DEFAULT_FUZZ_COUNT_TOTALS,
  runSyncFuzzParity,
} from "./fuzz/run-sync.mjs";

const PRIVATE_INPUT = String.fromCharCode(
  0x73, 0x6b, 0x2d, 0x70, 0x72, 0x69, 0x76, 0x61, 0x74, 0x65, 0x2d,
  0x66, 0x75, 0x7a, 0x7a, 0x2d, 0x70, 0x72, 0x6f, 0x62, 0x65,
);

function assertSameString(left, right, message) {
  assert.equal(left.length, right.length, message);
  for (let index = 0; index < left.length; index += 1) {
    assert.equal(left.charCodeAt(index) === right.charCodeAt(index), true, message);
  }
}

test("the fuzz corpus is deterministic, bounded, and covers every generator mode", () => {
  const first = generateFuzzCorpus();
  const second = generateFuzzCorpus();
  assert.equal(first.length, FAST_FUZZ_CASES);
  assert.equal(second.length, FAST_FUZZ_CASES);
  assert.deepEqual(new Set(first.map(({ category }) => category)), new Set(FUZZ_CATEGORIES));
  assert.deepEqual(new Set(first.map(({ sizeBand }) => sizeBand)), new Set(FUZZ_SIZE_BANDS.keys()));

  first.forEach((fuzzCase, index) => {
    assert.equal(fuzzCase.seed, DEFAULT_FUZZ_SEED, "fuzz seed metadata");
    assert.equal(fuzzCase.caseIndex, index, "fuzz case metadata");
    assert.equal(fuzzCase.text.length <= 2048, true, "fuzz input bound");
    assertSameString(fuzzCase.text, second[index].text, "deterministic fuzz sequence");
    assertSameString(
      fuzzCase.text,
      generateFuzzCase(DEFAULT_FUZZ_SEED, index).text,
      "individual fuzz regeneration",
    );
  });
});

test(
  "root, full JavaScript, and isolated counters match for the fast corpus",
  { timeout: 120_000 },
  () => {
    const first = runSyncFuzzParity();
    const second = runSyncFuzzParity();
    assert.equal(first.summary, second.summary);
    assert.equal(first.cases, FAST_FUZZ_CASES);
    assert.equal(first.checks, FAST_FUZZ_CASES * 6 * 3);
    assert.deepEqual(first.countTotals, DEFAULT_FUZZ_COUNT_TOTALS);
    assert.deepEqual(second.countTotals, DEFAULT_FUZZ_COUNT_TOTALS);
  },
);

test("injected mismatch diagnostics and stacks remain content-free", () => {
  const fuzzCase = {
    ...generateFuzzCase(0x12345678, 17),
    text: PRIVATE_INPUT,
  };
  let observed;
  try {
    assertFuzzCount({
      fuzzCase,
      encoding: "o200k_base",
      surface: "injected-test",
      expected: 7,
      actual: 8,
    });
  } catch (error) {
    observed = error;
  }
  assert.ok(observed instanceof Error);
  assert.equal(observed.message.includes(PRIVATE_INPUT), false);
  assert.equal(observed.stack.includes(PRIVATE_INPUT), false);
  assert.match(
    observed.message,
    new RegExp(
      "^Fuzz mismatch: seed=0x12345678 case=17 encoding=o200k_base " +
        "surface=injected-test utf16_length=21 utf8_bytes=21 " +
        "expected=7 actual=8$",
    ),
  );
});

test("fuzz execution emits no console output or generated corpus artifacts", {
  timeout: 120_000,
}, async () => {
  const calls = [];
  const originals = Object.fromEntries(
    ["debug", "error", "info", "log", "warn"].map((method) => [method, console[method]]),
  );
  for (const method of Object.keys(originals)) {
    console[method] = (...arguments_) => calls.push([method, ...arguments_]);
  }
  try {
    runSyncFuzzParity({ seed: 0x12345678, cases: 8 });
    assert.deepEqual(calls, []);
  } finally {
    Object.assign(console, originals);
  }

  const directory = await mkdtemp(join(tmpdir(), "token-counter-fuzz-probe-"));
  try {
    const result = await runFailureProbe(directory);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.includes(PRIVATE_INPUT), false);
    assert.match(
      result.stderr,
      new RegExp(
        "^Fuzz mismatch: seed=0x12345678 case=17 encoding=o200k_base " +
          "surface=injected-probe utf16_length=21 utf8_bytes=21 " +
          "expected=7 actual=8\\n$",
      ),
    );
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function runFailureProbe(cwd) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("./fuzz/failure-probe.mjs", import.meta.url))],
    { cwd, stdio: ["ignore", "pipe", "pipe"] },
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
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return { code, stderr, stdout };
}
