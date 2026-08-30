import { IsolatedCl100kCounter } from "../../encoding-isolation-poc.mjs";

const counter = new IsolatedCl100kCounter();

export function count(text) {
  return counter.count(text);
}
