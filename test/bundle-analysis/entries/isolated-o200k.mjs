import { Tiktoken } from "js-tiktoken/lite";
import o200kBase from "js-tiktoken/ranks/o200k_base";

const encoder = new Tiktoken(o200kBase);

export function count(text) {
  return encoder.encode(text, [], []).length;
}
