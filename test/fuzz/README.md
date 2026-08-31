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
the declared worker subset. The 192-case default Python qualification passes
all 1,152 encoding/case comparisons against official Python
`tiktoken==0.14.0`.

The prior 71 differences were classified using only seed/case/category/length
and numeric-count metadata. All were caused by the dependency's use of
JavaScript `\s`/`\S`: JavaScript omits U+0085 and includes U+FEFF, unlike the
reference regex engine's Unicode White_Space set. Counterfactual runs found 43
historical comparisons in generated whitespace/control cases and 28 in mixed
cases; translating only the pattern semantics cleared all 71, while a
surrogate-repair experiment cleared none. No generated string, token array, or
content fingerprint was retained. Local parity remains a preflight
qualification, not provider billing truth.

## Failure safety

Mismatch construction accepts generated text only to calculate UTF-16 and
UTF-8 lengths. Errors never interpolate the text, token IDs, derived filenames,
or content fingerprints. Adversarial tests inject a runtime-only secret-shaped
marker and inspect assertion messages, stacks, captured console calls, child
process output, and a temporary working directory for leakage.
