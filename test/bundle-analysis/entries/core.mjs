import { resolveTokenEncoding } from "@omiologic/token-counter/core";

export const encoding = resolveTokenEncoding({
  provider: "openai",
  model: "gpt-4",
});
