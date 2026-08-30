import p50kBase from "js-tiktoken/ranks/p50k_base";

import { createJsTiktokenLiteCounter } from "../adapters/js-tiktoken-lite.js";
import { installBrowserWorkerTokenCounter } from "../adapters/browser-worker-runtime.js";

export const browserWorkerEncoding = "p50k_base";

installBrowserWorkerTokenCounter(createJsTiktokenLiteCounter(p50kBase));
