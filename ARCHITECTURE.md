# Architecture

## Purpose

`@omiologic/token-counter` is a portable token measurement library for JavaScript and TypeScript applications.

Its responsibility is intentionally narrow:

> Accept model-bound text and return deterministic local token measurements using an injectable tokenizer implementation.

The package is designed for browser and server runtimes and should remain usable outside any specific application, provider SDK, agent framework, or context-management system.

## Architectural principles

### 1. Own the contract, not the tokenizer algorithm

Consumers depend on an application-owned abstraction:

```ts
export interface TokenCounter {
  count(text: string): number;
}

export interface AsyncTokenCounter {
  count(text: string): Promise<number>;
}

export interface BrowserWorkerTokenCounter extends AsyncTokenCounter {
  close(): void;
}
```

Model-specific tokenization remains behind adapters.

The initial adapter target is `js-tiktoken` for OpenAI-compatible encodings. The package must not expose `js-tiktoken` types through its public API.

### 2. Local-first and offline

Counting model-bound text must not require network access.

Tokenizer rank/encoding data should be bundled with the package or consuming application. Runtime CDN fetches, telemetry, remote counting APIs, and dynamic downloads are outside the architecture.

### 3. Browser and server parity

The same public counting contract should be usable in:

- browser applications;
- Node.js services;
- CLIs and local tools;
- test environments.

Runtime-specific behavior should remain behind adapters or build targets rather than changing the semantic counting contract.

### 4. Low privilege

A tokenizer receives potentially sensitive model-bound text. It therefore operates as a low-privilege component.

The package must not require access to:

- credentials;
- environment variables;
- application configuration unrelated to encoding selection;
- filesystem scanning;
- network clients;
- application logs;
- persistence layers.

The preferred data path is:

```text
Raw / untrusted input
        |
        v
Secret / sensitive-data scanner
        |
        v
Sanitized model-bound text
        |
        v
TokenCounter
        |
        v
Numeric measurement
```

Secret detection and redaction are explicitly outside this package. Consumers that handle sensitive input should establish that boundary before tokenization.

### 5. Estimates are not billing truth

Local token measurement supports preflight decisions and observability.

Provider-reported usage remains authoritative after invocation because complete provider accounting can include framing, tool schemas, special tokens, cached input, multimodal representations, or other provider-specific behavior.

The architecture therefore distinguishes:

```text
local/preflight measurement
            !=
provider-reported usage
```

The library does not own reconciliation policy, billing, or pricing tables.

## Boundaries

### Owned by `@omiologic/token-counter`

- Token counting contracts.
- Encoding/tokenizer descriptors required for deterministic counting.
- Tokenizer adapter lifecycle.
- Local token measurement.
- Model/encoding registry primitives when required for adapter selection.
- Deterministic fixtures and parity tests.
- Browser/Node compatibility.
- Dependency and supply-chain constraints specific to tokenizer implementations.

### Not owned

- Secret scanning or DLP policy.
- Redaction or credential vaults.
- Prompt construction.
- Context retrieval or selection.
- Evidence alias resolution.
- Context budgets and enforcement policy.
- Provider API invocation.
- Logical model routing.
- Pricing or cost calculations.
- Provider usage persistence.
- Semantic compression or context optimization.
- Prompt/response telemetry.

Keeping these boundaries narrow makes the package reusable and easier to audit.

## Component model

```text
Consumer
   |
   v
TokenCounter
   |
   +-----------------------------+
   |                             |
   v                             v
Counter Registry          Direct Adapter Injection
   |                             |
   v                             |
Encoding / model mapping         |
   |                             |
   +-------------+---------------+
                 |
                 v
          Tokenizer Adapter
                 |
          +------+------+
          |             |
          v             v
   js-tiktoken     future adapter
                 |
                 v
           numeric count
```

The registry is optional infrastructure. Simple consumers may instantiate an adapter directly.

## Public contract

The public API remains deliberately narrow.

```ts
export interface TokenCounter {
  count(text: string): number;
}

export interface TokenCounterDescriptor {
  fallbackEncoding?: TokenEncoding;
  provider?: string;
  model?: string;
  encoding?: TokenEncoding;
}
```

Additional APIs should be added only when real consumers require them.

Possible later extensions, only after a concrete consumer demonstrates a need
that cannot be met by composing `count()` with the existing descriptor and
encoding resolver, include:

```ts
export interface TokenMeasurement {
  tokens: number;
  encoding: string;
}
```

The safe-measurement-metadata evaluation found that a preflight observability
event containing a count and encoding can already be assembled by the consumer:
the count comes from `count()` and the stable encoding identifier comes from
deterministic selection. Do not duplicate caller-available metadata in the
counting result without additional evidence. If richer measurement output is
later justified, prefer an additive operation and preserve
`TokenCounter.count(text): number` compatibility.

An asynchronous interface should not be introduced merely because an implementation performs unnecessary runtime I/O. The preferred tokenizer path remains synchronous and local.

Async initialization and async counting are separate concerns. A locally
bundled implementation that only needs asynchronous setup should expose an
explicit factory returning `Promise<TokenCounter>`; once initialization
finishes, `count()` remains synchronous. Initialization failure must reject
before a counter is returned, must use content-free errors, and must never fall
back to a remote asset. Each factory call creates an independent ready counter;
an implementation may share only immutable local code or rank data, never input
text or token material.

An implementation whose count necessarily crosses an asynchronous boundary,
such as a browser worker, cannot satisfy `TokenCounter`. The optional browser
worker therefore implements the separate application-owned `AsyncTokenCounter`
contract and adds explicit `close()` ownership through
`BrowserWorkerTokenCounter`.

Each encoding-specific worker factory loads one matching local module-worker
asset and resolves only after it is ready. Its main-thread factory contains no
tokenizer rank data, so a worker-only consumer avoids duplicate main-thread
tokenizer initialization. The measured comparison still duplicates the rank
only because it deliberately loads both sync and worker paths side by side.
Initialization, worker, count, and close failures are content-free. `close()`
terminates the worker and rejects pending and future requests deterministically.
Cancellation should be added only when the adopted runtime demonstrates a need
and defines whether it cancels computation or merely discards the result; it
must not be assumed by the minimal interface. Initialization should occur once
per adapter instance rather than being hidden in every `count()` call. The
worker is browser-only, while trusted fixture parity preserves equivalent
counting semantics with Node and synchronous browser paths. Counting remains
offline after the explicit worker initialization boundary.

## `js-tiktoken` adapter

The initial adapter should wrap `js-tiktoken` without leaking it into consumer code.

Conceptually:

```ts
import type { TokenCounter } from "../token-counter";

export class JsTiktokenCounter implements TokenCounter {
  constructor(/* local encoding configuration */) {}

  count(text: string): number {
    return this.encoder.encode(text).length;
  }
}
```

### Adapter requirements

The adapter must:

- use locally available encoding/rank data;
- perform no network requests during initialization or counting;
- return deterministic counts for identical input and encoding;
- avoid logging or persisting input;
- expose no credential/configuration capability;
- be replaceable without changing consumer contracts.

## Encoding selection

Provider names and model names can change independently from tokenizer encodings. The architecture should avoid hard-wiring provider catalogs into the core counter interface.

A registry can map consumer intent to an encoding when necessary:

```text
provider/model hint
       |
       v
encoding registry
       |
       v
TokenCounter adapter
```

The registry should contain only data required for counting. Provider pricing, availability, capability routing, or API credentials belong elsewhere.

Unknown models should fail explicitly or require an explicit fallback policy supplied by the consumer. The library should not silently guess an encoding when correctness matters.

## Security invariants

### No runtime exfiltration path

The counting path should be structurally incapable of sending input elsewhere.

```text
text -> local tokenizer -> integer
```

No HTTP client is required for normal operation.

### No content telemetry

This package should not emit:

- raw text;
- token strings;
- encoded token arrays to logs;
- prompt fragments;
- response fragments;
- secret findings;
- credentials.

If diagnostics are ever added, they should be opt-in and limited to safe numeric/identifier metadata.

### Upstream sanitization

This package does not claim that its input is safe. Security-sensitive consumers should sanitize before counting.

A stronger consuming application can enforce trust-state types such as:

```ts
type SanitizedText = string & {
  readonly __brand: "SanitizedText";
};
```

That branded type belongs to the consumer/security boundary unless a future interoperable contract justifies adding it here.

### Supply-chain policy

Because tokenizer dependencies receive model-bound text:

1. Pin exact runtime dependency versions.
2. Commit the package lockfile.
3. Audit install/postinstall scripts before adoption or upgrade.
4. Review transitive dependencies.
5. Verify runtime network behavior.
6. Verify filesystem/environment access.
7. Review telemetry or analytics behavior.
8. Run deterministic parity tests before upgrades.

Automated dependency updates should not bypass this review.

## Measurement lifecycle

A typical consuming system may use the library at multiple points:

```text
Client
  sanitized prompt
       |
       v
  local token count
       |
       +--> UX feedback

Server
  assembled + sanitized model-bound request
       |
       v
  local token count
       |
       +--> preflight budget decision
       |
       v
  provider
       |
       v
  provider-reported usage
```

The library owns only the local counting steps. Budget decisions and estimate-vs-actual reconciliation belong to the consuming system.

## Testing strategy

### Known-answer fixtures

Maintain deterministic fixtures for:

- empty input;
- ASCII prose;
- source code;
- JSON/YAML/CSV-like data;
- Unicode;
- emoji;
- mixed-language content;
- large repeated and non-repeated inputs;
- special-token edge cases relevant to supported encodings.

### Reference parity

Where practical, compare expected counts against a trusted reference implementation for the same encoding.

For OpenAI-compatible encodings, official `tiktoken` output is an appropriate reference oracle.

### Runtime parity

The same fixtures should produce the same result in supported browser and Node builds.

### Offline verification

Tests should demonstrate that initialization and counting succeed with network access unavailable.

### Output safety

Tests should ensure public result objects contain numeric measurements/approved metadata rather than the original input text.

## Package layout

Initial direction:

```text
token-counter/
├── src/
│   ├── index.ts
│   ├── async-token-counter.ts
│   ├── token-counter.ts
│   ├── registry.ts
│   ├── adapters/
│   │   ├── browser-worker.ts
│   │   └── js-tiktoken.ts
│   └── workers/
│       └── <encoding>.{ts,worker.ts}
├── test/
│   ├── fixtures/
│   └── js-tiktoken.test.ts
├── README.md
├── ARCHITECTURE.md
├── package.json
├── tsconfig.json
└── package-lock.json
```

Avoid introducing framework-specific directories or application-domain concepts.

## Future adapters

The architecture allows additional tokenizer strategies without widening the core responsibility:

```text
TokenCounter
├── JsTiktokenCounter
├── HuggingFaceTokenCounter
└── ProviderSpecificEstimator
```

Adapters should be added based on concrete consumer needs rather than attempting to maintain a universal model catalog from the first release.

## Evolution rules

Changes to this package should preserve these invariants:

1. Counting remains usable offline.
2. Consumer contracts remain tokenizer-implementation agnostic.
3. The core package does not acquire provider invocation authority.
4. The core package does not acquire secret-scanning responsibility.
5. Pricing and billing logic remain outside the package.
6. Input content is not persisted or logged.
7. Model-specific complexity remains at adapter/registry boundaries.
8. Provider actual usage is never redefined as local tokenizer truth.

If a proposed feature violates these rules, it likely belongs in a consuming context-observability, security, provider, or orchestration layer instead.
