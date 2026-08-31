# token-counter agent instructions

## Required context

1. Read `README.md`, `ARCHITECTURE.md`, and `CONVENTIONS.md` before making material changes. Read `_notes/GOVERNANCE.md` as additional local policy when it exists.
2. When the temporary local `.agents/skills/context-governance/SKILL.md` is installed, use it for governed planning, Decisions, Conventions, Constraints, Git policy, and Version policy.
3. Keep changes within the portable, local-first token-measurement boundary described by the architecture.

## Security and architecture boundary

- Tokenization must remain local and offline, with no runtime downloads, telemetry, or network calls.
- Never log, persist, or return input text through public results or diagnostics.
- Do not read credentials, environment variables, or unrelated application configuration.
- Keep tokenizer implementations behind adapters and do not expose dependency-specific types through the public API.
- Treat local counts as preflight measurements, not provider billing truth.

## Change rules

- Preserve browser and Node.js compatibility and deterministic model/encoding selection.
- Pin tokenizer dependencies exactly and audit source, package scripts, transitive dependencies, and bundled data before upgrades.
- Add deterministic known-answer, Unicode, large-input, offline, and public-output tests as applicable.
- Follow `_notes/GOVERNANCE.md` for branch, commit, review, merge, version, and changelog policy when that local governance file exists. Governance declarations do not authorize Git or release operations.
- When Git operations are authorized, target this repository with `git -C .` and the adjacent Wiki with `git -C ../token-counter.wiki`; project-local Codex rules scope Git permissions to those forms.

## Release authority

A release requires explicit user approval after tests pass, tokenizer parity is verified, and the public API, dependency audit, and changelog have been reviewed. Do not choose a version, create a tag or release, publish a package, or deploy without that approval.

Prepare an approved version on `release/v{version-slug}` (for example, `release/v0-1-0-beta-1`), merge it into `main`, and dispatch publication from `main`. The release workflow creates annotated `v{version}` only after npm verification. Use `Reconcile Release` only with explicit authorization to repair a matching published version without republishing it.
