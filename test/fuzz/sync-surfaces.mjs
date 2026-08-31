import { createTokenCounter } from "@omiologic/token-counter";
import { JsTiktokenCounter } from "@omiologic/token-counter/js";
import {
  createTokenCounter as createCl100kBase,
} from "@omiologic/token-counter/encodings/cl100k_base";
import { createTokenCounter as createGpt2 } from "@omiologic/token-counter/encodings/gpt2";
import {
  createTokenCounter as createO200kBase,
} from "@omiologic/token-counter/encodings/o200k_base";
import { createTokenCounter as createP50kBase } from "@omiologic/token-counter/encodings/p50k_base";
import { createTokenCounter as createP50kEdit } from "@omiologic/token-counter/encodings/p50k_edit";
import { createTokenCounter as createR50kBase } from "@omiologic/token-counter/encodings/r50k_base";

const ISOLATED_FACTORIES = Object.freeze({
  cl100k_base: createCl100kBase,
  gpt2: createGpt2,
  o200k_base: createO200kBase,
  p50k_base: createP50kBase,
  p50k_edit: createP50kEdit,
  r50k_base: createR50kBase,
});

export function createSyncFuzzCounters(encoding) {
  const createIsolated = ISOLATED_FACTORIES[encoding];
  if (createIsolated === undefined) {
    throw new Error("Unsupported fuzz encoding.");
  }
  return Object.freeze([
    Object.freeze(["root", createTokenCounter({ encoding })]),
    Object.freeze(["js", new JsTiktokenCounter(encoding)]),
    Object.freeze(["isolated", createIsolated()]),
  ]);
}
