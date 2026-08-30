# @omiologic/token-counter

Portable, local-first token measurement for JavaScript and TypeScript applications.

`@omiologic/token-counter` provides a small application-owned token counting contract that can run in both browser and server runtimes while delegating model-specific tokenization to audited adapters.

The initial implementation target is [`js-tiktoken`](https://github.com/dqbd/tiktoken) for OpenAI-compatible encodings.

## Why this repository exists

Token counting is simple at the application boundary, but model tokenization is not. Applications should own the contract they depend on, while tokenizer implementations remain replaceable implementation details.

This repository is intended to own:

- a narrow `TokenCounter` interface;
- deterministic model/encoding selection;
- browser and Node compatibility;
- local/offline token measurement;
- tests and dependency upgrade policy;
- primitives that can be composed into context budgets and observability systems.

It is intentionally not responsible for prompt selection, secret detection, provider invocation, billing truth, pricing tables, semantic optimization, or model routing.

## Security model

Tokenizer dependencies operate on model-bound text and should be treated as low-privilege components.

```text
raw / untrusted text
        |
        v
secret or sensitive-data scanner
        |
        v
sanitized model-bound text
        |
        v
@omiologic/token-counter
        |
        v
numeric token count
```

Recommended invariants:

- tokenization is local and offline;
- encoding/rank data is bundled locally rather than fetched at runtime;
- tokenizer input is never logged or persisted by this package;
- this package does not read environment variables or credentials;
- this package performs no runtime network requests;
- consumers sanitize secret-bearing text before counting;
- tokenizer dependencies are version-pinned and audited before upgrades.

A server should still perform its own final secret scan before a complete model-bound payload is sent to an external provider.

## Proposed API

Keep the public surface deliberately small:

```ts
export interface TokenCounter {
  count(text: string): number;
}

export interface TokenCounterDescriptor {
  provider?: string;
  model?: string;
  encoding: string;
}
```

An adapter can implement the contract without exposing its tokenizer dependency:

```ts
import type { TokenCounter } from "@omiologic/token-counter";

export class JsTiktokenCounter implements TokenCounter {
  count(text: string): number {
    // js-tiktoken remains an implementation detail.
    return 0;
  }
}
```

Consumers should depend on `TokenCounter`, not directly on `js-tiktoken`.

## Browser and server usage

```text
Browser
  sanitized user input
       |
       v
  TokenCounter
       |
       +--> UX estimate / local warning

Server
  sanitized assembled request
       |
       v
  TokenCounter
       |
       +--> preflight budget / composition metrics
       |
       v
  provider
       |
       +--> provider-reported actual usage
```

Client counting is useful for UX. Server counting is suitable for preflight enforcement. Provider-reported usage remains the post-invocation source of truth.

## Why `js-tiktoken`

The initial adapter uses `js-tiktoken` because it fits a shared JavaScript/TypeScript stack and can run locally in both browser and server environments.

The dependency stays behind an adapter so future consumers can support other strategies without changing application-level contracts:

```text
OpenAI-compatible models -> JsTiktokenCounter
Hugging Face models      -> HuggingFaceTokenCounter
Other providers          -> provider-specific estimator
```

## Accuracy

A local tokenizer can measure text controlled by the application, but a provider request can add or account for additional structure such as message framing, tool definitions, schemas, special tokens, multimodal inputs, or cached-input accounting.

Therefore:

```text
preflight estimate != provider-reported usage
```

Applications should record both numeric values when useful and reconcile estimate error without persisting model-bound content.

## Planned package shape

```text
token-counter/
├── src/
│   ├── index.ts
│   ├── token-counter.ts
│   ├── registry.ts
│   └── adapters/
│       └── js-tiktoken.ts
├── test/
│   ├── fixtures/
│   └── js-tiktoken.test.ts
├── README.md
└── ARCHITECTURE.md
```

## Testing expectations

The implementation should include:

- deterministic known-answer token fixtures;
- Unicode and mixed-language fixtures;
- empty and large-input cases;
- parity checks against a trusted reference where practical;
- browser and Node runtime tests;
- tests that counting works with network access unavailable;
- tests ensuring public results contain counts/metadata rather than input text.

## Dependency policy

1. Pin exact dependency versions and commit the lockfile.
2. Audit dependency source, package scripts, dependencies, network behavior, filesystem behavior, and telemetry before adoption or upgrade.
3. Bundle required encoding data locally.
4. Run deterministic parity fixtures before merging an upgrade.
5. Do not allow automatic dependency updates to bypass review.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the boundary design and security invariants.

## Status

Architecture/bootstrap phase. The initial intended implementation is a small TypeScript package with a `js-tiktoken` adapter and no runtime network dependency.
