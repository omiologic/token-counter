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
- this package calls no remote service and downloads no tokenizer data;
- optional workers load one explicitly selected, colocated module asset during
  initialization and make no later counting request;
- consumers sanitize secret-bearing text before counting;
- tokenizer dependencies are version-pinned and audited before upgrades.

A server should still perform its own final secret scan before a complete model-bound payload is sent to an external provider.

## Public API

The public surface is deliberately small and does not expose tokenizer dependency types:

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

export interface TokenCounterDescriptor {
  encoding?: TokenEncoding;
  fallbackEncoding?: TokenEncoding;
  provider?: string;
  model?: string;
}
```

For the convenient root API, create a counter from any supported descriptor:

```ts
import { createTokenCounter } from "@omiologic/token-counter";

const counter = createTokenCounter({
  provider: "openai",
  model: "gpt-4o",
});
const tokens = counter.count("sanitized model-bound text");
```

The root also preserves direct access to the registry and JavaScript adapter.
Consumers that want explicit payload control can use the subpaths instead:

```ts
import type { TokenCounter } from "@omiologic/token-counter/core";
import { resolveTokenEncoding } from "@omiologic/token-counter/core";
import { JsTiktokenCounter } from "@omiologic/token-counter/js";

const encoding = resolveTokenEncoding({
  provider: "openai",
  model: "gpt-4o",
});
const counter: TokenCounter = new JsTiktokenCounter(encoding);
```

`@omiologic/token-counter/core` contains only application-owned contracts and
deterministic selection primitives. It has no runtime import of `js-tiktoken`
or tokenizer encoding data. `@omiologic/token-counter/js` adds the audited
JavaScript adapter and its locally bundled data. The root composes both surfaces
for convenience.

### Isolated encoding entry points

Browser bundles that need one known encoding can import a static encoding
subpath. Each subpath exports the same zero-argument factory and returns the
application-owned `TokenCounter` interface:

```ts
import { createTokenCounter } from "@omiologic/token-counter/encodings/o200k_base";

const counter = createTokenCounter();
const tokens = counter.count("sanitized model-bound text");
```

| Encoding | Import path |
| --- | --- |
| `cl100k_base` | `@omiologic/token-counter/encodings/cl100k_base` |
| `gpt2` | `@omiologic/token-counter/encodings/gpt2` |
| `o200k_base` | `@omiologic/token-counter/encodings/o200k_base` |
| `p50k_base` | `@omiologic/token-counter/encodings/p50k_base` |
| `p50k_edit` | `@omiologic/token-counter/encodings/p50k_edit` |
| `r50k_base` | `@omiologic/token-counter/encodings/r50k_base` |

An isolated entry statically imports `js-tiktoken/lite` and only its selected
rank module. It does not expose the dependency's rank object or token arrays.
The rank data is installed with the pinned dependency and is included by an ESM
bundler; initialization and counting never download data.

Import only the encoding subpaths a bundle needs. Importing multiple isolated
entries includes each selected vocabulary, while importing the root or `/js`
keeps the convenient all-encoding behavior. Static entries also let build tools
cache or split encoding payloads independently. For local hosting, vendor the
resolved package and dependency artifacts together and serve versioned assets
with immutable caching. Do not substitute a runtime rank-data URL or a floating
production version.

### Optional browser worker entry points

Browser applications with sustained large workloads can select an encoding-
specific dedicated worker without initializing that tokenizer on the main
thread:

```ts
import { createTokenCounter } from "@omiologic/token-counter/workers/o200k_base";

const counter = await createTokenCounter();
try {
  const tokens = await counter.count("sanitized model-bound text");
} finally {
  counter.close();
}
```

The factory resolves only after the local module worker is ready. `close()`
terminates the caller-owned worker and rejects pending and future counts with a
content-free error. The synchronous `TokenCounter` contract and root factory
remain unchanged.

| Encoding | Import path |
| --- | --- |
| `cl100k_base` | `@omiologic/token-counter/workers/cl100k_base` |
| `gpt2` | `@omiologic/token-counter/workers/gpt2` |
| `o200k_base` | `@omiologic/token-counter/workers/o200k_base` |
| `p50k_base` | `@omiologic/token-counter/workers/p50k_base` |
| `p50k_edit` | `@omiologic/token-counter/workers/p50k_edit` |
| `r50k_base` | `@omiologic/token-counter/workers/r50k_base` |

Each factory resolves its matching `<encoding>.worker.js` beside the factory
module. A bundler must preserve that relative module-worker URL and emit or copy
the matching worker asset; a static host must serve both files from the same
exact-version directory. Worker initialization is the explicit local asset-load
boundary. Counting performs no later network request, returns only an integer,
and does not log or persist text. Keep the synchronous surface for small or
infrequent counts where worker startup and message transfer are not justified.

### Immutable CDN and vendored layout

The verified static layout maps the same npm specifiers to standalone browser
ESM files beneath an exact-version prefix:

| npm specifier | Exact-version artifact path |
| --- | --- |
| `@omiologic/token-counter` | `/npm/@omiologic/token-counter@<exact-version>/index.js` |
| `@omiologic/token-counter/core` | `/npm/@omiologic/token-counter@<exact-version>/core.js` |
| `@omiologic/token-counter/js` | `/npm/@omiologic/token-counter@<exact-version>/js.js` |
| `@omiologic/token-counter/encodings/<encoding>` | `/npm/@omiologic/token-counter@<exact-version>/encodings/<encoding>.js` |
| `@omiologic/token-counter/workers/<encoding>` | `/npm/@omiologic/token-counter@<exact-version>/workers/<encoding>.js` |
| worker asset selected by that factory | `/npm/@omiologic/token-counter@<exact-version>/workers/<encoding>.worker.js` |

`<exact-version>` must be replaced by an explicitly selected immutable package
version. This repository has not selected one and does not publish or endorse a
particular CDN origin. A CDN or local build pipeline should derive these files
from the matching packed npm artifact and its pinned dependencies; the library
must never fetch code or rank data after the module has loaded.

Static sites can keep their application imports identical to npm by mapping the
specifiers to exact URLs:

```html
<script type="importmap">
{
  "imports": {
    "@omiologic/token-counter/core":
      "https://cdn.example/npm/@omiologic/token-counter@<exact-version>/core.js",
    "@omiologic/token-counter/encodings/o200k_base":
      "https://cdn.example/npm/@omiologic/token-counter@<exact-version>/encodings/o200k_base.js"
  }
}
</script>
```

`cdn.example` is a non-operational placeholder. Do not use `latest`, version
ranges, redirects to a moving version, or a runtime rank-data endpoint in
production examples.

For local vendoring, copy the entire exact-version directory without changing
its contents and point the same import-map keys at local paths. Serve versioned
artifacts and their `integrity.json` manifest with
`Cache-Control: public, max-age=31536000, immutable`; serve HTML and mutable
import maps with revalidation or a short cache lifetime. Verify each artifact's
SHA-384 value before deployment. Where the browser loading mechanism supports
Subresource Integrity for the module entry, use the same `sha384-...` value;
otherwise enforce the manifest during the trusted build or vendoring step.
Worker factory and worker asset hashes are both included in the manifest and
must be verified and vendored together.

The local verification materializes this layout from a fixture-only version of
the packed package, checks every hash, copies and imports the vendored files,
and runs every surface in a browser. It also verifies that isolated encoding
artifacts contain only the selected rank module and that counting makes no
request after the explicit module-load checkpoint.

Selection is case-sensitive and deterministic:

1. A supported explicit `encoding` takes precedence over provider/model hints and fallback.
2. Otherwise, an exact supported `provider` and `model` pair is resolved.
3. Otherwise, a caller-supplied supported `fallbackEncoding` is used.
4. Unknown or partial input fails with a content-free error; the library never guesses.

Supported explicit encodings are `cl100k_base`, `gpt2`, `o200k_base`, `p50k_base`, `p50k_edit`, and `r50k_base`.

The initial model mappings are:

| Provider | Model | Encoding |
| --- | --- | --- |
| `openai` | `gpt-4` | `cl100k_base` |
| `openai` | `gpt-4.1` | `o200k_base` |
| `openai` | `gpt-4o` | `o200k_base` |
| `openai` | `gpt-4o-mini` | `o200k_base` |

Consumers should depend on `TokenCounter`, not directly on `js-tiktoken`. Special-token marker strings are counted as ordinary text; the package does not expose dependency special-token controls or token arrays.

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

The emitted ESM targets ES2022 and supports Node.js 18 or newer. Browser
consumers should use an ESM-capable bundler so the package and its locally
bundled encoding data are included in the application build. Synchronous
initialization and all counting perform no runtime downloads or remote lookups;
an optional worker factory has the explicit colocated asset-load boundary
described above.

## Supported environments and ownership

| Surface | Supported runtime | Consumer responsibility |
| --- | --- | --- |
| package root | Node.js 18+ and ESM-capable browser builds | Supply a deterministic descriptor and bundle the local tokenizer data. |
| `/core` | Node.js 18+ and ESM-capable browser builds | Compose application-owned contracts and selection without tokenizer code. |
| `/js` | Node.js 18+ and ESM-capable browser builds | Select a supported encoding and accept the all-encoding JavaScript payload. |
| `/encodings/<encoding>` | Node.js 18+ and ESM-capable browser builds | Import only the required static encoding entry. |
| `/workers/<encoding>` | Browsers with dedicated module-worker support | Await readiness, host or emit the matching worker asset, and always call `close()` when finished. |
| exact-version static layout | ESM-capable browsers | Derive files from one packed version, verify SHA-384 values, and host factory/worker pairs together. |

The package owns deterministic local measurement and content-free public
failures. Applications own input sanitization, worker lifetime, bundle and
static-host configuration, context-budget decisions, provider invocation, and
post-invocation usage reconciliation. Worker `close()` terminates the
caller-owned worker; pending and future counts reject without returning input
text. Exact content-free error wording is not a compatibility promise.

No richer measurement result, WASM adapter, additional tokenizer adapter,
worker cancellation API, provider accounting, or runtime tokenizer download is
supported. Those evaluated ideas are deferred rather than release commitments.
See the [local feature index](./_notes/features/README.md) for the evidence and
current disposition of each capability.

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

## Package shape

```text
token-counter/
├── src/
│   ├── index.ts
│   ├── core.ts
│   ├── js.ts
│   ├── async-token-counter.ts
│   ├── token-counter.ts
│   ├── registry.ts
│   ├── encodings/
│   │   └── <encoding>.ts
│   ├── adapters/
│   │   ├── browser-worker.ts
│   │   ├── js-tiktoken.ts
│   │   └── js-tiktoken-lite.ts
│   └── workers/
│       └── <encoding>.{ts,worker.ts}
├── test/
│   ├── fixtures/
│   ├── reference/
│   └── *.test.mjs
├── CHANGELOG.md
├── README.md
└── ARCHITECTURE.md
```

## Verification

Run the deterministic Node and browser suites from the committed lockfile:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
```

`npm test` builds the package, runs Node tests with runtime network entry points denied, bundles the same fixture suite for a locally installed headless Chrome/Chromium/Edge browser, and runs browser checks with network, logging, and persistence APIs denied. The browser test server binds only to `127.0.0.1` for module delivery.

The committed suite covers:

- deterministic known-answer token fixtures;
- Unicode and mixed-language fixtures;
- empty and large-input cases;
- parity checks for every supported encoding against official `openai/tiktoken==0.14.0`;
- browser and Node runtime tests;
- network-denied initialization and counting;
- public results, errors, logs, declarations, and exports that contain no input text or token arrays.
- one-rank-only browser bundles, trusted parity, and denied-network execution for every isolated encoding entry.
- exact-version CDN-style artifacts, immutable cache headers, SHA-384 manifests, and equivalent vendored imports.
- worker readiness, concurrency, lifecycle, failure, close, offline, output-safety, and per-encoding trusted parity.
- worker factories with no main-thread tokenizer payload and worker artifacts containing exactly one selected rank module.
- the recorded public export and declaration baseline compiled with TypeScript
  `NodeNext` and `Bundler` module resolution.

Run the packed-package reproducibility qualification separately when preparing
release-readiness evidence:

```sh
npm run test:reproducibility
```

This qualification performs two independent `npm ci --ignore-scripts` builds,
packs each build with a fixture-only version, and compares a sorted manifest of
relative paths, byte lengths, and SHA-384 content hashes. It then installs each
tarball into a clean minimal consumer with package scripts denied and the
package-manager network disabled. Those installed copies run the trusted
fixture corpus through every documented Node and browser surface, verify
isolated and worker payload boundaries, and materialize equivalent CDN-style
and vendored layouts. A locally installed Chrome, Chromium, or Edge executable
is required. See the [recorded qualification evidence](./_notes/release-readiness/reproducible-packed-package.md).

The browser worker evaluation measures the public `o200k_base` worker against
the synchronous isolated counter for a sustained large nonrepeated workload:

```sh
npm run build
node test/evaluation/evaluate-browser-worker.mjs
```

The production confirmation reduced the median maximum heartbeat gap by 94.1%
while preserving fixture parity and making no request after initialization. See the
[browser worker evaluation](./_notes/worker-analysis/README.md) for the workload,
payload and memory costs, and adoption boundary. Performance values are
machine-specific evidence rather than test thresholds.

The largest deterministic test input is 54,843 UTF-8 bytes, and every fixture is bounded below 64 KiB. The suite uses a generous browser timeout rather than a machine-speed assertion, avoiding flaky performance thresholds while still verifying completion within a fixed resource envelope.

Reference provenance and reproduction instructions are recorded in [`test/fixtures/README.md`](./test/fixtures/README.md). Re-run the independent Python reference check with:

```sh
/tmp/token-counter-reference/bin/python test/reference/verify_tiktoken.py
```

## Compatibility and semver baseline

The checked-in [public API baseline](./test/fixtures/public-api-baseline.json)
is the reviewable inventory of package subpaths, value exports, type-only
exports, worker assets, and declaration signatures. The committed
[consumer fixture](./test/fixtures/consumers/public-api.ts) exercises every
surface. Package tests compare the packed export map and declarations to that
baseline and compile the consumer with both supported TypeScript resolution
styles.

The following are public compatibility commitments:

- the root, `/core`, `/js`, `/encodings/<encoding>`, and
  `/workers/<encoding>` subpaths recorded in the baseline;
- the application-owned exported names and signatures reachable from those
  subpaths;
- synchronous numeric `TokenCounter.count()`, synchronous isolated factories,
  and the descriptor-based root factory;
- asynchronous worker creation and counting, readiness before factory
  resolution, caller-owned `close()`, and deterministic rejection of pending
  and future work after closure;
- deterministic encoding selection, local/offline counting after explicit
  asset initialization, numeric-only results, and content-free failures; and
- ESM, browser, and Node.js 18-or-newer support declared by the package.

Adding a new opt-in subpath or independent export is normally additive when it
does not change existing declarations, loading, or behavior. Adding an optional
descriptor field is also normally additive. Removing or renaming a supported
subpath or export, making an optional input required, changing a public type or
constructor incompatibly, changing a synchronous result to asynchronous (or
the reverse), replacing a numeric result, or weakening worker close, offline,
or content-safety behavior is breaking under the configured semver policy.

Expanding `TokenEncoding`, changing a model-to-encoding mapping, or adopting a
tokenizer change that alters counts requires explicit compatibility review; a
union expansion can break exhaustive TypeScript consumers and is not assumed
to be additive. Dependency implementation types must never enter the public
declaration closure.

Dependency internals, private adapter classes, worker message protocol details,
generated bundle bytes and hashes across versions, exact content-free error
wording, and evaluation timing or memory measurements are not compatibility
promises. Immutable artifacts remain immutable within a selected version, but
their byte layout is not frozen across versions. Provider billing and usage
accounting remain outside this package.

This baseline supports future version classification. It does not select a
version or authorize a release.

## Dependency policy

1. Pin exact dependency versions and commit the lockfile.
2. Audit dependency source, package scripts, dependencies, network behavior, filesystem behavior, and telemetry before adoption or upgrade.
3. Bundle required encoding data locally.
4. Run deterministic parity fixtures before merging an upgrade.
5. Do not allow automatic dependency updates to bypass review.

The current post-worker dependency graph and tokenizer parity are recorded in
the [dated release dependency review](./_notes/dependency-audits/post-worker-release-review-2026-08-30.md).
That evidence does not select a version or authorize a release.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the boundary design and security invariants.

## Status

The root, core, JavaScript adapter, isolated encoding, and optional browser
worker surfaces are verified locally. The package remains private and has no
selected release version; verification does not authorize publication or
release. Review the [Unreleased changelog](./CHANGELOG.md) and the
[support review checklist](./_notes/release-readiness/unreleased-support-review.md)
before any later release decision.
