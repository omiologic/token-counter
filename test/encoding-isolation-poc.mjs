import { Tiktoken } from "js-tiktoken/lite";
import cl100kBase from "js-tiktoken/ranks/cl100k_base";

const COUNT_FAILURE_MESSAGE = "Token counting failed.";

/**
 * Proof of the package-owned boundary proposed for isolated encoding adapters.
 * The dependency rank shape remains private to this module.
 */
export class IsolatedCl100kCounter {
  #encoder;

  constructor() {
    this.#encoder = new Tiktoken(cl100kBase);
  }

  count(text) {
    try {
      return this.#encoder.encode(text, [], []).length;
    } catch {
      throw new Error(COUNT_FAILURE_MESSAGE);
    }
  }
}
