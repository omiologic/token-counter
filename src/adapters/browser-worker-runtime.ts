import type { TokenCounter } from "../token-counter.js";

interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  postMessage(message: unknown): void;
}

function requestId(value: unknown): number {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id)
  ) {
    return value.id;
  }
  return -1;
}

/** Installs the content-safe request boundary for a statically selected counter. */
export function installBrowserWorkerTokenCounter(counter: TokenCounter): void {
  const scope = globalThis as unknown as WorkerScope;

  scope.addEventListener("message", (event) => {
    const id = requestId(event.data);
    try {
      if (
        typeof event.data !== "object" ||
        event.data === null ||
        !("operation" in event.data) ||
        event.data.operation !== "count" ||
        !("text" in event.data) ||
        typeof event.data.text !== "string" ||
        id < 0
      ) {
        throw new Error();
      }
      const count = counter.count(event.data.text);
      scope.postMessage({ count, id, ok: true });
    } catch {
      scope.postMessage({ id, ok: false });
    }
  });

  scope.postMessage({ ready: true });
}
