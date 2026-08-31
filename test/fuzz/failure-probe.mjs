import { generateFuzzCase } from "./generator.mjs";
import { assertFuzzCount } from "./safety.mjs";

const privateInput = String.fromCharCode(
  0x73, 0x6b, 0x2d, 0x70, 0x72, 0x69, 0x76, 0x61, 0x74, 0x65, 0x2d,
  0x66, 0x75, 0x7a, 0x7a, 0x2d, 0x70, 0x72, 0x6f, 0x62, 0x65,
);
const fuzzCase = {
  ...generateFuzzCase(0x12345678, 17),
  text: privateInput,
};

try {
  assertFuzzCount({
    fuzzCase,
    encoding: "o200k_base",
    surface: "injected-probe",
    expected: 7,
    actual: 8,
  });
  process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
