globalThis.addEventListener("message", () => {
  queueMicrotask(() => {
    throw new Error("Deliberate content-free worker failure.");
  });
});

globalThis.postMessage({ ready: true });
