import r50kBase from "js-tiktoken/ranks/r50k_base";

import { createJsTiktokenLiteCounter } from "../adapters/js-tiktoken-lite.js";
import { installBrowserWorkerTokenCounter } from "../adapters/browser-worker-runtime.js";

export const browserWorkerEncoding = "r50k_base";

installBrowserWorkerTokenCounter(createJsTiktokenLiteCounter(r50kBase));
