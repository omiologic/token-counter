import { ENCODINGS, parseFuzzSeed } from "./generator.mjs";

export function parseFuzzArguments(arguments_, {
  defaultCases,
  defaultPython,
  requireCase = false,
  requireEncoding = false,
} = {}) {
  const options = {
    cases: defaultCases,
    python: defaultPython,
  };
  const known = new Set(["--case", "--cases", "--encoding", "--python", "--seed"]);

  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!known.has(name) || value === undefined) {
      throw new Error("Unsupported fuzz command arguments.");
    }
    switch (name) {
      case "--case":
        options.caseIndex = parseNonNegativeInteger(value, "case index");
        break;
      case "--cases":
        options.cases = parsePositiveInteger(value, "case budget");
        break;
      case "--encoding":
        if (!ENCODINGS.includes(value)) throw new Error("Unsupported fuzz encoding.");
        options.encoding = value;
        break;
      case "--python":
        options.python = value;
        break;
      case "--seed":
        options.seed = parseFuzzSeed(value);
        break;
    }
  }

  if (requireCase && options.caseIndex === undefined) {
    throw new Error("The fuzz case index is required.");
  }
  if (requireEncoding && options.encoding === undefined) {
    throw new Error("The fuzz encoding is required.");
  }
  return Object.freeze(options);
}

function parseNonNegativeInteger(value, label) {
  if (!/^[0-9]+$/.test(value)) throw new Error(`Invalid fuzz ${label}.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid fuzz ${label}.`);
  }
  return parsed;
}

function parsePositiveInteger(value, label) {
  const parsed = parseNonNegativeInteger(value, label);
  if (parsed < 1 || parsed > 4096) throw new Error(`Invalid fuzz ${label}.`);
  return parsed;
}
