---
name: document-freshness
description: Keep repository-local documentation aligned with source-code changes, and synchronize derivative GitHub Wiki pages only when the user explicitly requests the Wiki update. Use during implementation or review when changed behavior, interfaces, support state, examples, or evidence may make documentation stale.
---

# Document Freshness

Keep documentation aligned with the behavior the repository actually supports. Treat local documentation maintenance as part of an authorized source-code change when the change makes mapped documentation stale. Treat GitHub Wiki synchronization as a separate external publication step that requires explicit user authorization.

## Find the documentation route

Read the applicable `CONVENTIONS.md` before deciding which documents are affected. Follow its repository-local documentation paths and any governed Convention records it links; do not embed project-specific feature paths in this reusable workflow.

Use the changed source, tests, public API, and completed work-item evidence to determine whether a document is stale. Do not update a page merely because its topic is adjacent to the change.

## Update local documentation implicitly

When source-code changes are authorized, update directly affected repository-local documentation without requiring a second request. This includes stale descriptions of current behavior, public examples, support-state labels, and evidence links identified by the applicable conventions.

- Preserve the repository's source-of-truth hierarchy and document only verified behavior.
- Keep planning, proposed behavior, and current behavior distinct.
- Prefer links to authoritative source, tests, architecture, and work items over copied implementation detail.
- Do not broaden the implementation, alter unrelated documentation, or infer Git, release, publication, or deployment authority.
- If documentation cannot be made accurate from available evidence, report the uncertainty instead of guessing.

Review the resulting source and local-documentation diff together. Run proportionate documentation checks when the repository provides them.

## Update the GitHub Wiki only when explicit

Do not edit, commit, push, or otherwise synchronize a GitHub Wiki unless the user explicitly asks for the Wiki update. A source-code task, completed work item, local feature-note edit, or freshness finding is not authorization.

After explicit authorization:

1. Finish and verify the source-code and repository-local documentation updates first.
2. Resolve the corresponding Wiki target from repository conventions and existing Wiki structure; do not invent a destination when the mapping is ambiguous.
3. Adapt the verified local documentation for the Wiki while preserving accurate state, boundaries, and authoritative links.
4. Review the Wiki diff separately and report what was synchronized.

Editing Wiki working-tree files does not imply permission to commit, push, publish, create a release, or deploy. Obtain the authorization required for each separate operation.
