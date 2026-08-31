import {
  createTokenCounter,
  type AsyncTokenCounter,
  type BrowserWorkerTokenCounter,
  type TokenCounter,
  type TokenCounterDescriptor,
  type TokenEncoding,
} from "@omiologic/token-counter";
import { resolveTokenEncoding } from "@omiologic/token-counter/core";
import { JsTiktokenCounter } from "@omiologic/token-counter/js";
import { createTokenCounter as createCl100kBase } from "@omiologic/token-counter/encodings/cl100k_base";
import { createTokenCounter as createGpt2 } from "@omiologic/token-counter/encodings/gpt2";
import { createTokenCounter as createO200kBase } from "@omiologic/token-counter/encodings/o200k_base";
import { createTokenCounter as createP50kBase } from "@omiologic/token-counter/encodings/p50k_base";
import { createTokenCounter as createP50kEdit } from "@omiologic/token-counter/encodings/p50k_edit";
import { createTokenCounter as createR50kBase } from "@omiologic/token-counter/encodings/r50k_base";
import { createTokenCounter as createCl100kBaseWorker } from "@omiologic/token-counter/workers/cl100k_base";
import { createTokenCounter as createGpt2Worker } from "@omiologic/token-counter/workers/gpt2";
import { createTokenCounter as createO200kBaseWorker } from "@omiologic/token-counter/workers/o200k_base";
import { createTokenCounter as createP50kBaseWorker } from "@omiologic/token-counter/workers/p50k_base";
import { createTokenCounter as createP50kEditWorker } from "@omiologic/token-counter/workers/p50k_edit";
import { createTokenCounter as createR50kBaseWorker } from "@omiologic/token-counter/workers/r50k_base";

const descriptor: TokenCounterDescriptor = {
  fallbackEncoding: "cl100k_base",
  model: "gpt-4o",
  provider: "openai",
};
const encoding: TokenEncoding = resolveTokenEncoding(descriptor);
const counters: TokenCounter[] = [
  createTokenCounter(descriptor),
  new JsTiktokenCounter(encoding),
  createCl100kBase(),
  createGpt2(),
  createO200kBase(),
  createP50kBase(),
  createP50kEdit(),
  createR50kBase(),
];

for (const counter of counters) {
  const count: number = counter.count("sanitized model-bound text");
  void count;
}

async function useWorkers(): Promise<void> {
  const workers: BrowserWorkerTokenCounter[] = await Promise.all([
    createCl100kBaseWorker(),
    createGpt2Worker(),
    createO200kBaseWorker(),
    createP50kBaseWorker(),
    createP50kEditWorker(),
    createR50kBaseWorker(),
  ]);

  for (const worker of workers) {
    const asyncCounter: AsyncTokenCounter = worker;
    const count: number = await asyncCounter.count("sanitized model-bound text");
    worker.close();
    void count;
  }
}

void useWorkers;
