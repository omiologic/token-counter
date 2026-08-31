export function installBrowserWorkerGuards() {
  const deny = () => {
    throw new Error("Runtime capability denied by browser worker test.");
  };

  for (const method of ["debug", "error", "info", "log", "warn"]) {
    console[method] = deny;
  }

  globalThis.fetch = deny;
  if (globalThis.XMLHttpRequest) globalThis.XMLHttpRequest.prototype.open = deny;
  globalThis.WebSocket = deny;
  globalThis.EventSource = deny;
  if (globalThis.Navigator?.prototype?.sendBeacon) {
    globalThis.Navigator.prototype.sendBeacon = deny;
  }
  if (globalThis.Storage?.prototype?.setItem) {
    globalThis.Storage.prototype.setItem = deny;
  }
  if (globalThis.indexedDB?.open) globalThis.indexedDB.open = deny;
  if (globalThis.caches?.open) globalThis.caches.open = deny;
}
