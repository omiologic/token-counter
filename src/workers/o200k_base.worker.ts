import o200kBase from "js-tiktoken/ranks/o200k_base";

import { createJsTiktokenLiteCounter } from "../adapters/js-tiktoken-lite.js";
import { installBrowserWorkerTokenCounter } from "../adapters/browser-worker-runtime.js";

export const browserWorkerEncoding = "o200k_base";

installBrowserWorkerTokenCounter(createJsTiktokenLiteCounter(o200kBase));
