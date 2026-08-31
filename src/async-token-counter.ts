/** An implementation-independent token counter whose work crosses an async boundary. */
export interface AsyncTokenCounter {
  count(text: string): Promise<number>;
}

/** A browser-worker counter whose dedicated resource is owned by the caller. */
export interface BrowserWorkerTokenCounter extends AsyncTokenCounter {
  /** Terminates the worker and rejects pending and future counts. */
  close(): void;
}
