import p50kEdit from "js-tiktoken/ranks/p50k_edit";

import { createJsTiktokenLiteCounter } from "../adapters/js-tiktoken-lite.js";
import { installBrowserWorkerTokenCounter } from "../adapters/browser-worker-runtime.js";

export const browserWorkerEncoding = "p50k_edit";

installBrowserWorkerTokenCounter(createJsTiktokenLiteCounter(p50kEdit));
