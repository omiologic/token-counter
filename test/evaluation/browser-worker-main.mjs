import { createTokenCounter } from "../../dist/encodings/o200k_base.js";

const counter = createTokenCounter();

export function count(text) {
  try {
    return counter.count(text);
  } catch {
    throw new Error("Token counting failed.");
  }
}
