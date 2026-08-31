export const ENCODINGS = Object.freeze([
  "cl100k_base",
  "gpt2",
  "o200k_base",
  "p50k_base",
  "p50k_edit",
  "r50k_base",
]);

export const DEFAULT_FUZZ_SEED = 0x5eedc0de;
export const FAST_FUZZ_CASES = 48;
export const REFERENCE_FUZZ_CASES = 192;
export const WORKER_FUZZ_CASE_INDEXES = Object.freeze([
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45,
]);

export const FUZZ_CATEGORIES = Object.freeze([
  "empty",
  "ascii",
  "whitespace-controls",
  "utf16-code-units",
  "surrogate-patterns",
  "repeated-fragments",
  "high-entropy",
  "mixed",
]);

export const FUZZ_SIZE_BANDS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([1, 8]),
  Object.freeze([9, 32]),
  Object.freeze([33, 128]),
  Object.freeze([129, 512]),
  Object.freeze([513, 2048]),
]);

const WHITESPACE_AND_CONTROLS = Object.freeze([
  0x0000, 0x0009, 0x000a, 0x000d, 0x0020, 0x007f, 0x0085,
  0x00a0, 0x200b, 0x2028, 0x2029, 0x202e, 0x2066, 0xfeff,
]);
const SURROGATE_PATTERNS = Object.freeze([
  Object.freeze([0xd800]),
  Object.freeze([0xdc00]),
  Object.freeze([0xd800, 0xdc00]),
  Object.freeze([0xdbff, 0xdfff]),
  Object.freeze([0xdc00, 0xd800]),
  Object.freeze([0x0041, 0xd800, 0x0042]),
  Object.freeze([0xd800, 0xd800, 0xdc00]),
]);
const MIXED_POOLS = Object.freeze([
  Object.freeze([0x0000, 0x0009, 0x000a, 0x000d, 0x0020]),
  Object.freeze([0x0030, 0x0041, 0x005a, 0x0061, 0x007a, 0x007e]),
  Object.freeze([0x00a0, 0x0301, 0x03a9, 0x0416, 0x4e2d, 0x6587]),
  Object.freeze([0x200b, 0x202e, 0x2066, 0xfeff]),
  Object.freeze([0xd800, 0xdbff, 0xdc00, 0xdfff]),
]);

function asUint32(value) {
  return value >>> 0;
}

function mixSeed(seed, caseIndex) {
  let value = asUint32(seed ^ Math.imul(caseIndex + 1, 0x9e3779b9));
  value = asUint32(Math.imul(value ^ (value >>> 16), 0x85ebca6b));
  value = asUint32(Math.imul(value ^ (value >>> 13), 0xc2b2ae35));
  value = asUint32(value ^ (value >>> 16));
  return value === 0 ? 0x6d2b79f5 : value;
}

function createRandom(seed) {
  let state = asUint32(seed);
  return () => {
    state = asUint32(state ^ (state << 13));
    state = asUint32(state ^ (state >>> 17));
    state = asUint32(state ^ (state << 5));
    return state;
  };
}

function randomBetween(random, minimum, maximum) {
  if (minimum === maximum) return minimum;
  return minimum + (random() % (maximum - minimum + 1));
}

function unitsToString(codeUnits) {
  return String.fromCharCode(...codeUnits);
}

function randomUnits(random, length, factory) {
  return Array.from({ length }, () => factory(random));
}

function generateText(category, length, random) {
  switch (category) {
    case "empty":
      return "";
    case "ascii":
      return unitsToString(
        randomUnits(random, length, (next) => 0x20 + (next() % 0x5f)),
      );
    case "whitespace-controls":
      return unitsToString(
        randomUnits(
          random,
          length,
          (next) => WHITESPACE_AND_CONTROLS[next() % WHITESPACE_AND_CONTROLS.length],
        ),
      );
    case "utf16-code-units":
      return unitsToString(
        randomUnits(random, length, (next) => next() & 0xffff),
      );
    case "surrogate-patterns": {
      const units = [];
      while (units.length < length) {
        const pattern = SURROGATE_PATTERNS[random() % SURROGATE_PATTERNS.length];
        units.push(...pattern);
      }
      return unitsToString(units.slice(0, length));
    }
    case "repeated-fragments": {
      const fragmentLength = Math.max(1, Math.min(length, 1 + (random() % 24)));
      const fragment = unitsToString(
        randomUnits(random, fragmentLength, (next) => next() & 0xffff),
      );
      return fragment.repeat(Math.ceil(length / fragment.length)).slice(0, length);
    }
    case "high-entropy": {
      const units = [];
      const used = new Set();
      while (units.length < length) {
        const unit = random() & 0xffff;
        if (used.size < 0x10000 && used.has(unit)) continue;
        used.add(unit);
        units.push(unit);
      }
      return unitsToString(units);
    }
    case "mixed":
      return unitsToString(
        randomUnits(random, length, (next) => {
          const pool = MIXED_POOLS[next() % MIXED_POOLS.length];
          return pool[next() % pool.length];
        }),
      );
    default:
      throw new Error("Unsupported fuzz category.");
  }
}

export function parseFuzzSeed(value) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
      throw new Error("Fuzz seed must be an unsigned 32-bit integer.");
    }
    return value >>> 0;
  }
  if (typeof value !== "string" || !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) {
    throw new Error("Fuzz seed must be an unsigned 32-bit integer.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0xffffffff) {
    throw new Error("Fuzz seed must be an unsigned 32-bit integer.");
  }
  return parsed >>> 0;
}

export function formatFuzzSeed(seed) {
  return `0x${parseFuzzSeed(seed).toString(16).padStart(8, "0")}`;
}

export function generateFuzzCase(seed, caseIndex) {
  const normalizedSeed = parseFuzzSeed(seed);
  if (!Number.isSafeInteger(caseIndex) || caseIndex < 0) {
    throw new Error("Fuzz case index must be a non-negative safe integer.");
  }
  const category = FUZZ_CATEGORIES[caseIndex % FUZZ_CATEGORIES.length];
  const sizeBand = Math.floor(caseIndex / FUZZ_CATEGORIES.length) % FUZZ_SIZE_BANDS.length;
  const [minimum, maximum] = FUZZ_SIZE_BANDS[sizeBand];
  const random = createRandom(mixSeed(normalizedSeed, caseIndex));
  const length = randomBetween(random, minimum, maximum);
  return {
    category,
    caseIndex,
    seed: normalizedSeed,
    sizeBand,
    text: generateText(category, length, random),
  };
}

export function generateFuzzCorpus({
  seed = DEFAULT_FUZZ_SEED,
  cases = FAST_FUZZ_CASES,
  startCase = 0,
} = {}) {
  const normalizedSeed = parseFuzzSeed(seed);
  if (!Number.isSafeInteger(cases) || cases < 1 || cases > 4096) {
    throw new Error("Fuzz case budget must be an integer from 1 through 4096.");
  }
  if (!Number.isSafeInteger(startCase) || startCase < 0) {
    throw new Error("Fuzz start case must be a non-negative safe integer.");
  }
  return Array.from({ length: cases }, (_, offset) =>
    generateFuzzCase(normalizedSeed, startCase + offset),
  );
}
