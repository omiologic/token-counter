import gpt2 from "js-tiktoken/ranks/gpt2";

import { createJsTiktokenLiteCounter } from "../adapters/js-tiktoken-lite.js";
import { installBrowserWorkerTokenCounter } from "../adapters/browser-worker-runtime.js";

export const browserWorkerEncoding = "gpt2";

installBrowserWorkerTokenCounter(createJsTiktokenLiteCounter(gpt2));
