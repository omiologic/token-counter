# Changelog

This file records user-visible package changes. An `Unreleased` entry does not
select or authorize a release.

## [Unreleased]

### Documentation

- Documented the consumer-side serialization gap in `README.md` and
  `ARCHITECTURE.md`: counting the parts of a request is not the same as
  counting the serialized request, the difference under-reports and scales with
  the number of embedded values, and closing it is a consumer responsibility
  because this package never observes request assembly. No API, behavior, or
  dependency change.

## [0.1.0-beta.1] - 2026-09-04

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

### Fixed

- Restored arbitrary-JavaScript-string parity with the pinned official
  `tiktoken==0.14.0` reference by translating the dependency's JavaScript
  `\s`/`\S` pre-tokenization semantics to the reference Unicode White_Space
  set. All 204 curated and 1,152 deterministic generated comparisons now pass
  across six encodings without input normalization, a dependency change, or a
  public API change.

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
- Added deterministic privacy-safe fuzzing across root, full JavaScript,
  isolated, and bounded browser-worker surfaces. Seed/case replay and
  content-free failure metadata expose generated semantic differences without
  printing or retaining input or token arrays. The opt-in Python qualification
  currently records arbitrary-string differences between the pinned JavaScript
  adapter and official Python reference; reviewed fixture parity remains
  unchanged.
- Added browser-worker readiness, concurrency, lifecycle, close, payload
  isolation, offline-counting, out-of-order/duplicate/late response races,
  safe request-ID exhaustion, and content-free failure checks. Closing a worker
  rejects pending and future counts without returning input text, and
  close/failure overlap terminates the worker at most once.
- Added a checked-in public API baseline, installed-consumer compilation under
  TypeScript `NodeNext` and `Bundler` resolution, and reproducible packed-file
  manifest and content-hash qualification.
- Added a separate deterministic megabyte-scale stress qualification covering
  synchronous/worker count parity, heartbeat responsiveness, elapsed time, and
  approximate memory at 1, 5, and 20 MiB without adding a public input limit.
- Added strict same-origin CSP and denied-worker qualification in Chrome 151.
  The current release-grade host matrix does not qualify Firefox or Safari/
  WebKit; no runtime fallback, browser download, or test dependency was added.

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
