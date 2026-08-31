# Changelog

This file records user-visible package changes. The project has not selected a
release version, date, channel, registry, CDN provider, or deployment target.

## [Unreleased]

### Added

- Added the application-owned synchronous `TokenCounter` contract, numeric
  `count(text)` results, and the six supported `TokenEncoding` values:
  `cl100k_base`, `gpt2`, `o200k_base`, `p50k_base`, `p50k_edit`, and
  `r50k_base`.
- Added deterministic descriptor selection with explicit-encoding precedence,
  exact case-sensitive OpenAI model mappings, caller-supplied fallback, and
  content-free failure for unknown or partial selections.
- Added the convenient package root, dependency-independent `/core`, and
  audited JavaScript `/js` entry points without exposing tokenizer dependency
  types.
- Added six `/encodings/<encoding>` entry points. Each synchronously creates an
  application-owned counter while bundling only its selected local tokenizer
  rank module.
- Added the application-owned `AsyncTokenCounter` and
  `BrowserWorkerTokenCounter` contracts and six optional browser-only
  `/workers/<encoding>` factories. Each factory resolves after its colocated
  module worker is ready; callers terminate the worker with `close()`.
- Added a verified exact-version static ESM layout for CDN-style or local
  vendored consumption, including SHA-384 integrity metadata, immutable-cache
  guidance, and paired worker-factory and worker-asset ownership.

### Security and reliability

- Pinned `js-tiktoken@1.0.21` and its runtime transitive dependency exactly,
  audited dependency source and capabilities, and bundled all tokenizer data
  locally.
- Added deterministic known-answer, Unicode, mixed-language, special-token,
  pathological JavaScript-string, bounded large-input, browser/Node parity,
  denied-network, and public-output checks for all six encodings against the
  pinned official Python `tiktoken` reference. The pathological corpus covers
  exact lone-surrogate code units, normalization pairs, format controls, and
  representative transport-like inputs without package-owned normalization.
- Added browser-worker readiness, concurrency, lifecycle, close, payload
  isolation, offline-counting, and content-free failure checks. Closing a
  worker rejects pending and future counts without returning input text.
- Added a checked-in public API baseline, installed-consumer compilation under
  TypeScript `NodeNext` and `Bundler` resolution, and reproducible packed-file
  manifest and content-hash qualification.

### Compatibility and support

- The package is ESM, targets ES2022, and supports Node.js 18 or newer for its
  synchronous surfaces; synchronous surfaces are also verified in an
  ESM-capable browser build.
- Browser workers are opt-in and browser-only. A bundler or static host owns
  emission and same-version hosting of each selected worker factory and its
  matching worker asset.
- Counts are local preflight measurements, not provider usage or billing
  truth. Provider-added framing, tools, schemas, special tokens, cached input,
  multimodal accounting, and pricing remain outside the package.
- Public results remain numeric and errors remain content-free. Input text is
  not logged, persisted, or returned through public diagnostics.

### Deferred and unsupported

- Rich measurement metadata remains deferred because consumers can compose
  the numeric count with `resolveTokenEncoding()`; no richer result type is
  supported.
- The evaluated WASM adapter is deferred and is neither a dependency nor a
  public package surface.
- Additional tokenizer adapters are deferred until a named consumer supplies
  an exact tokenizer target and complete offline, parity, and supply-chain
  requirements.
- Provider invocation, secret scanning, prompt construction, context-budget
  policy, provider usage reconciliation, billing, pricing, worker
  cancellation, runtime tokenizer downloads, and floating-version CDN URLs are
  unsupported.

### Release status

- This entry is release-readiness documentation only. A future version, tag,
  release, publication, CDN upload, or deployment requires separate explicit
  human approval after the tests, tokenizer parity, public API, dependency
  audit, changelog, and release-readiness recommendation are reviewed.
