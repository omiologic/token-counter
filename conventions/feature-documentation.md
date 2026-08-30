---
convention_id: convention-feature-documentation
status: accepted
scope: workspace
strength: default
---

# Convention

Use `_notes/features/<feature>/README.md` as a small, temporary staging page for future GitHub Wiki content. Each page should explain what the feature does, what works now, what may come next, and where the relevant source or planning record lives. Use `current`, `planned`, `proposed`, or `unknown` only when the label helps.

When an authorized source-code change makes a feature page or the feature index stale, update the affected repository-local documentation as part of that work. GitHub Wiki pages are derivative publication targets and are updated only after local documentation is current and the user explicitly requests the Wiki update.

## Rationale

This repository is small and focused. One concise page per feature is easier to scan, maintain, and later move into the GitHub Wiki than a multi-document feature system. Links prevent the temporary notes from becoming a competing source of truth.

Separate architecture, resource, requirements, or roadmap documents are not expected. Add another file only when the feature page genuinely becomes difficult to use.

## Guidance

The readable repository guidance is maintained in [`CONVENTIONS.md`](../CONVENTIONS.md#feature-notes).
