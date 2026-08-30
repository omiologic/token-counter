import { JsTiktokenCounter } from "@omiologic/token-counter/js";

const counter = new JsTiktokenCounter("cl100k_base");

export function count(text) {
  return counter.count(text);
}
