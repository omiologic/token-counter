import type { BrowserWorkerTokenCounter } from "../async-token-counter.js";

const INITIALIZATION_FAILURE_MESSAGE = "Token counter initialization failed.";
const COUNT_FAILURE_MESSAGE = "Token counting failed.";
const CLOSED_MESSAGE = "Token counter is closed.";
const WORKER_FAILURE_MESSAGE = "Token counter worker failed.";
const INITIALIZATION_TIMEOUT_MILLISECONDS = 30_000;

interface PendingCount {
  reject(error: Error): void;
  resolve(count: number): void;
}

type CounterState = "closed" | "failed" | "open";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function initializationError(): Error {
  return new Error(INITIALIZATION_FAILURE_MESSAGE);
}

class LocalBrowserWorkerTokenCounter implements BrowserWorkerTokenCounter {
  readonly #worker: Worker;
  readonly #pending = new Map<number, PendingCount>();
  #nextRequestId = 0;
  #state: CounterState = "open";

  constructor(worker: Worker, initialRequestId = 0) {
    this.#worker = worker;
    this.#nextRequestId = initialRequestId;
    worker.addEventListener("message", this.#onMessage);
    worker.addEventListener("error", this.#onFailure);
    worker.addEventListener("messageerror", this.#onFailure);
  }

  count(text: string): Promise<number> {
    if (this.#state !== "open") {
      return Promise.reject(
        new Error(
          this.#state === "closed" ? CLOSED_MESSAGE : WORKER_FAILURE_MESSAGE,
        ),
      );
    }
    if (typeof text !== "string") {
      return Promise.reject(new Error(COUNT_FAILURE_MESSAGE));
    }
    if (!Number.isSafeInteger(this.#nextRequestId) || this.#nextRequestId < 0) {
      return Promise.reject(new Error(COUNT_FAILURE_MESSAGE));
    }

    const id = this.#nextRequestId;
    this.#nextRequestId += 1;

    return new Promise<number>((resolve, reject) => {
      this.#pending.set(id, { reject, resolve });
      try {
        this.#worker.postMessage({ id, operation: "count", text });
      } catch {
        this.#pending.delete(id);
        reject(new Error(COUNT_FAILURE_MESSAGE));
      }
    });
  }

  close(): void {
    if (this.#state !== "open") return;
    this.#state = "closed";
    this.#detach();
    this.#worker.terminate();
    this.#rejectPending(CLOSED_MESSAGE);
  }

  readonly #onMessage = (event: MessageEvent<unknown>): void => {
    const response = event.data;
    if (
      !isRecord(response) ||
      !Number.isSafeInteger(response.id) ||
      typeof response.id !== "number"
    ) {
      this.#fail();
      return;
    }

    const pending = this.#pending.get(response.id);
    if (pending === undefined) {
      this.#fail();
      return;
    }
    this.#pending.delete(response.id);

    if (
      response.ok === true &&
      typeof response.count === "number" &&
      Number.isSafeInteger(response.count) &&
      response.count >= 0
    ) {
      pending.resolve(response.count);
      return;
    }
    if (response.ok === false) {
      pending.reject(new Error(COUNT_FAILURE_MESSAGE));
      return;
    }

    pending.reject(new Error(WORKER_FAILURE_MESSAGE));
    this.#fail();
  };

  readonly #onFailure = (event: Event): void => {
    event.preventDefault();
    this.#fail();
  };

  #fail(): void {
    if (this.#state !== "open") return;
    this.#state = "failed";
    this.#detach();
    this.#worker.terminate();
    this.#rejectPending(WORKER_FAILURE_MESSAGE);
  }

  #detach(): void {
    this.#worker.removeEventListener("message", this.#onMessage);
    this.#worker.removeEventListener("error", this.#onFailure);
    this.#worker.removeEventListener("messageerror", this.#onFailure);
  }

  #rejectPending(message: string): void {
    for (const pending of this.#pending.values()) {
      pending.reject(new Error(message));
    }
    this.#pending.clear();
  }
}

/** Creates a ready counter from one explicit local module-worker asset. */
export function createBrowserWorkerTokenCounter(
  workerUrl: URL,
  workerName: string,
  initialRequestId = 0,
): Promise<BrowserWorkerTokenCounter> {
  if (!Number.isSafeInteger(initialRequestId) || initialRequestId < 0) {
    return Promise.reject(initializationError());
  }
  let worker: Worker;
  try {
    worker = new Worker(workerUrl, {
      credentials: "same-origin",
      name: workerName,
      type: "module",
    });
  } catch {
    return Promise.reject(initializationError());
  }

  return new Promise<BrowserWorkerTokenCounter>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => fail(), INITIALIZATION_TIMEOUT_MILLISECONDS);

    const cleanup = (): void => {
      clearTimeout(timeout);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onFailure);
      worker.removeEventListener("messageerror", onFailure);
    };
    const fail = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate();
      reject(initializationError());
    };
    const onFailure = (event: Event): void => {
      event.preventDefault();
      fail();
    };
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (!isRecord(event.data) || event.data.ready !== true) {
        fail();
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      resolve(new LocalBrowserWorkerTokenCounter(worker, initialRequestId));
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onFailure);
    worker.addEventListener("messageerror", onFailure);
  });
}
