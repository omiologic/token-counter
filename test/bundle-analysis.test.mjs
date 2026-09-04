import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("bundle analysis matches the committed isolation evidence", async () => {
  const [{ stdout }, expectedText] = await Promise.all([
    execFileAsync(process.execPath, ["test/analyze-bundles.mjs"], {
      maxBuffer: 16 * 1024 * 1024,
    }),
    readFile(
      new URL("./fixtures/encoding-isolation.results.json", import.meta.url),
      "utf8",
    ),
  ]);

  const actual = JSON.parse(stdout);
  const expected = JSON.parse(expectedText);
  assert.deepEqual(actual, expected);

  const cl100k = actual.measurements.find(
    (measurement) => measurement.entry === "isolated-cl100k",
  );
  const o200k = actual.measurements.find(
    (measurement) => measurement.entry === "isolated-o200k",
  );
  assert.deepEqual(cl100k.rank_modules, ["cl100k_base.js"]);
  assert.deepEqual(o200k.rank_modules, ["o200k_base.js"]);
});
