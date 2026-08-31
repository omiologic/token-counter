# Deterministic privacy-safe fuzzing

The fuzz harness generates bounded JavaScript strings locally and never writes,
prints, snapshots, or uploads a generated string or token array. A case is
identified only by a 32-bit seed and a non-negative case index.

## Generator contract

`generator.mjs` uses xorshift32 with an independently mixed state for each case.
The case index selects one of eight categories and one of six UTF-16 code-unit
size bands:

- categories: empty, ASCII, whitespace and controls, arbitrary UTF-16 code
  units, surrogate patterns, repeated fragments, bounded high entropy, and a
  mixed alphabet;
- size bands: 0, 1–8, 9–32, 33–128, 129–512, and 513–2,048 code units;
- default seed: `0x5eedc0de`;
- ordinary fast budget: 48 cases; and
- opt-in reference budget: 192 cases.

The generator has no time, randomness, filesystem, environment, or network
input. JavaScript and Python implement the same unsigned 32-bit algorithm.
Individual case generation is independent, so replay does not require storing
or shrinking the generated text.

## Commands and surface matrix

Run the bounded JavaScript surface check, including the browser worker subset:

```sh
npm run test:fuzz
```

The default fast corpus compares root, full JavaScript, and isolated counters
for all six encodings. The browser harness reruns that matrix and compares ten
declared case indexes across root, full JavaScript, isolated, and worker
surfaces. Per-encoding numeric count totals pin the default sequence across the
Node and browser engines that execute the shared generator. This fast check is
also part of the ordinary `npm test` path.

Reproduce one case without displaying it:

```sh
npm run test:fuzz:case -- \
  --seed 0x5eedc0de --case 31 --encoding cl100k_base
```

The command reports only seed, case index, encoding, UTF-16 and UTF-8 lengths,
surface identifiers, and numeric counts.

After installing the pinned Python oracle as described in the fixture
documentation, run the deeper qualification:

```sh
npm run test:fuzz:reference
```

Override its executable or replay one bounded range explicitly:

```sh
npm run test:fuzz:reference -- \
  --python /tmp/token-counter-reference/bin/python \
  --seed 0x12345678 --case 17 --cases 1
```

The Python process independently regenerates each case and returns only numeric
counts. The Node verifier exhausts the requested matrix, caps displayed
mismatches, and emits only the allowlisted reproduction metadata above.

## Current qualification result

The 48-case JavaScript matrix passes across root, full JavaScript, isolated, and
the declared worker subset. The 192-case default Python qualification currently
detects 71 differences among 1,152 encoding/case comparisons: 12
`cl100k_base`, 11 `gpt2`, 13 `o200k_base`, 12 `p50k_base`, 12 `p50k_edit`, and
11 `r50k_base` differences. The command therefore exits nonzero by design.

This result narrows the earlier trusted-reference claim: the reviewed fixture
corpus still matches the pinned oracle, while arbitrary generated JavaScript
strings are not universally equivalent between `js-tiktoken@1.0.21` and
official Python `tiktoken==0.14.0`. Seed and case metadata are the retained
regression evidence; generated inputs are not retained. A later dependency or
adapter decision must rerun this qualification rather than treating current
local counts as provider or Python billing truth.

## Failure safety

Mismatch construction accepts generated text only to calculate UTF-16 and
UTF-8 lengths. Errors never interpolate the text, token IDs, derived filenames,
or content fingerprints. Adversarial tests inject a runtime-only secret-shaped
marker and inspect assertion messages, stacks, captured console calls, child
process output, and a temporary working directory for leakage.
