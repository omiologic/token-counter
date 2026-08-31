import cl100kBase from "js-tiktoken/ranks/cl100k_base";

import { createJsTiktokenLiteCounter } from "../adapters/js-tiktoken-lite.js";
import { installBrowserWorkerTokenCounter } from "../adapters/browser-worker-runtime.js";

export const browserWorkerEncoding = "cl100k_base";

installBrowserWorkerTokenCounter(createJsTiktokenLiteCounter(cl100kBase));
