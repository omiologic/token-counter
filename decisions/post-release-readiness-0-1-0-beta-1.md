---
decision_id: decision-post-release-readiness-0-1-0-beta-1
status: accepted
scope: repository
recorded: 2026-09-05
supersedes: _notes/release-readiness/initial-release-readiness-decision.md
work_item: https://github.com/omiologic/token-counter/issues/11
---

# Post-release readiness record — 0.1.0-beta.1

**State:** released, incrementing on the `beta` channel

**Recorded:** 2026-09-05

**Release authority:** granted and exercised on 2026-09-04

## Why this record exists

`_notes/release-readiness/initial-release-readiness-decision.md` was accurate on
2026-08-30 and its gate results remain the evidence for what was qualified. It
is no longer accurate as a description of project state. Read today it says
release authority is not granted, the package is private, and no version or
release channel has been selected. All three changed on 2026-09-04.

That decision is marked superseded with a pointer to this record rather than
rewritten, so its qualification evidence stays readable as it was written.

## What shipped

| Property | Value |
| --- | --- |
| npm version | `0.1.0-beta.1` |
| `gitHead` | `ccd4c1d90139cd4c9c9cd563672d89b91ac4a925` — exactly `main` at publication |
| Annotated tag | `v0.1.0-beta.1` |
| dist-tags | `beta`, `latest` |
| Tarball | 22.1 kB packed, 86,820 bytes unpacked, 114 files |
| Integrity | `sha512-2CM8FKm4skdbu7JS5g6jYzoyeRlIrizeYUvHyEWLw6Fsd0m3HXd5EI7LWuFLa5o1o7hdRf8ZCUPAFhupbt+52w==` |

The integrity value matches the tarball hash from `npm pack --dry-run` and the
lockfile entry recorded by the first consuming repository, so the artifact
consumers install is provably the one that was packed. The table was re-read
from the registry on 2026-09-05 and matched.

The publication itself, and the four defects that had to be fixed to reach it,
are recorded in [issue #7](https://github.com/omiologic/token-counter/issues/7).

## Beta-increment policy

Versions increment on the `beta` channel — `0.1.0-beta.2`, `beta.3`, and so on.
Promotion to `stable` is not automatic and is not scheduled here.

When this policy was framed, its stated exit condition was downstream validation
from `omiologic/agentic-wx` closing
[#8](https://github.com/omiologic/token-counter/issues/8). #8 closed on
2026-09-05, and the consumer-side serialization gap it surfaced is now written
into `README.md` and `ARCHITECTURE.md`.

That closure satisfies the accuracy precondition. It does not move the channel.
Selecting a version and a release channel is a human release decision under
[Release authority](../AGENTS.md#release-authority), and no such decision is
recorded here. Until one is, increments stay on `beta`.

Remaining MVP Readiness work at the time of writing: issues #9, #10, #11, #12.

## `latest` resolving to a prerelease is accepted

`npm install @omiologic/token-counter` currently resolves to `0.1.0-beta.1`,
because npm sets `latest` on a first publish regardless of `--tag`.

This is an accepted consequence, not a defect awaiting a fix. Each subsequent
beta publish moves `latest` forward, and the condition ends when a stable
version is published. Do not open remediation work for it.

## Residual risks carried forward

These rows are unchanged from the superseded decision and remain live.

| Residual risk | Owner | Status |
| --- | --- | --- |
| Published tokenizer rank modules are package-hash pinned but not reconstructible from the declared upstream source revision alone. | Dependency reviewer | Unchanged. Re-audit before any approved release. |
| The development-only `esbuild` postinstall can reach the network, environment, and subprocesses. | Build/release operator | Unchanged. `npm ci --ignore-scripts` remains the control. |
| Worker initialization requires a colocated same-version browser module asset. | Distributor and consumer | Unchanged. Exact-version layout only. |
| npm advisory and license metadata are dated and can be incomplete. | Dependency reviewer | Unchanged. Source and capability review remains the stronger control. |
| Local counts exclude provider framing, tools, schemas, caching, and billing rules. | Consuming application | Unchanged as a boundary. The consumer-side serialization component is now documented and measured rather than only asserted (#8). |

Two rows from the superseded decision are satisfied and are **not** carried
forward: *"No version or release channel has been selected"* (2026-09-04) and
*"The qualified candidate changes are uncommitted on protected `main`"* (PRs #3
through #6).

## The risk the original decision missed

The superseded gate table lists every suite as `passed` on evidence produced on
a developer machine, and treated that as qualification. Four of those gates
could not pass in a clean environment. Each was found one release dispatch at a
time and fixed in PRs #4, #5, and #6.

The lesson belongs in the record: **passing locally was never evidence, and the
readiness decision did not distinguish the two.** A gate result qualifies a
release only if it was produced somewhere a reviewer can reproduce.

Its control is [#9](https://github.com/omiologic/token-counter/issues/9).
`.github/workflows/ci.yml` now runs `npm run release:check` — the same command
the release gate runs at its `Qualify release` step — on every pull request and
on push to `main`. #9 remains open until that workflow has been shown to fail on
a known defect, so the control is installed but not yet demonstrated.

## Evidence-trail caveat

`_notes/` is git-ignored, per `AGENTS.md` and `CONVENTIONS.md`. The
qualification evidence this record supersedes — gate results, dependency audits,
bundle-analysis baselines — is therefore not reproducible from a clone, and the
MVP milestone rests on it.

This record is committed under `decisions/` so that superseding a decision
produces a reviewable diff. The underlying evidence stays outside version
control; that design is unchanged here. It is worth noting that the same ignore
rule was the direct cause of the first of the four CI-only failures in #7.
