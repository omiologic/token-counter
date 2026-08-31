import { runSyncFuzzParity } from "./fuzz/run-sync.mjs";

const result = runSyncFuzzParity();
process.stdout.write(`${result.summary}\n`);
