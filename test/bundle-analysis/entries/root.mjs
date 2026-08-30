import { createTokenCounter } from "@omiologic/token-counter";

const counter = createTokenCounter({ encoding: "cl100k_base" });

export function count(text) {
  return counter.count(text);
}
