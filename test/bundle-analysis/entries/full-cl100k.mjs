import { getEncoding } from "js-tiktoken";

const encoder = getEncoding("cl100k_base");

export function count(text) {
  return encoder.encode(text, [], []).length;
}
