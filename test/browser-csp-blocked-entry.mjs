import { createTokenCounter } from "../dist/workers/o200k_base.js";

let consoleCalls = 0;
for (const method of ["debug", "error", "info", "log", "warn"]) {
  console[method] = () => { consoleCalls += 1; };
}

try {
  const privateMarker = "csp-blocked-private-marker";
  try {
    await createTokenCounter();
    throw new Error("Blocked worker unexpectedly initialized.");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "Token counter initialization failed." ||
      error.message.includes(privateMarker) ||
      consoleCalls !== 0
    ) {
      throw new Error("Blocked CSP failure was not content-free.");
    }
  }
  globalThis.location.replace("/__csp_passed__?suite=blocked");
} catch {
  globalThis.location.replace("/__csp_failed__?suite=blocked");
}
