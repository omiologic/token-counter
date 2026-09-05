---
decision_id: decision-governance-merge-strategy-and-commit-style
status: accepted
scope: repository
recorded: 2026-09-05
applies_to: _notes/GOVERNANCE.md
work_item: https://github.com/omiologic/token-counter/issues/12
---

# Governance contract corrections — merge strategy, commit style, work-item references

**Decision:** integration is by merge commit; commit subjects are freeform;
work-item traceability is carried by the branch name and pull request, not by
commit messages.

**Recorded:** 2026-09-05

Three fields in `_notes/GOVERNANCE.md` contradicted observable history. The
contract was wrong, not the practice. Each is corrected below with the reason,
so that a later reader can tell which parts of that file are binding.

The permitted values come from the `git_governance` schema in the temporary
local `.agents/skills/context-governance` reference, which is why "remove the
declaration" is not among the options for any of the three.

## `merge_strategy`: `squash` → `merge`

Every merge to `main` has been a true merge commit:

```
ccd4c1d Merge pull request #6 from omiologic/fix/linux-ci-release-check
fd37481 make release:check pass on a clean Linux runner
f9fdbda Merge pull request #5 from omiologic/fix/browser-profile-teardown-race
e8e2b5e wait for browser exit before removing its profile directory
d961c33 Merge pull request #4 from omiologic/fix/bundle-analysis-evidence
e4d013e track the bundle isolation baseline as a test fixture
```

Neither squash nor rebase is wanted. The merge-commit shape earned its place
during the release recorded in
[#7](https://github.com/omiologic/token-counter/issues/7): each of the four
CI-only fixes stayed an individually reviewable commit on `main`, so the defects
could be read separately afterwards instead of collapsing into one squashed
blob.

`branch_strategy`, `branch_lifecycle`, `branch_pattern`, `protected_branches`,
and `review_required` are accurate and are left as they are.

## `commit_style`: `conventional` → `freeform`

Subjects in this repository are plain imperative and carry no conventional
`type:` prefix:

```
run the release gate on every pull request
document the consumer-side serialization gap
make release:check pass on a clean Linux runner
wait for browser exit before removing its profile directory
track the bundle isolation baseline as a test fixture
restore arbitrary string reference parity
update release automation
```

The only conventional subjects on `main` are the four oldest commits, all from
before the move to GitHub issues. The declaration has been contradicted by every
commit since.

The choice was to adopt conventional commits going forward or to stop declaring
them. Stopping is the smaller change and matches what reviewers already read;
`freeform` is the schema's value for it. Nothing about this repository's size or
tooling depends on parsing commit subjects.

## `require_work_item_reference`: `true` → `false`

Under the schema this field means every governed commit message must contain its
exact work-item ID in the subject or body. That was written for the `_notes/plans/`
work-item IDs, such as `token-counter-00019`, which GitHub issues replaced. No
commit in the release carried one, and none should start to.

Traceability did not disappear with the field; it moved. It is carried by the
branch name and the pull request:

- branches name the issue they close — `docs/8-measure-what-you-send`,
  `feat/9-ci-release-gate`, `feat/10-remove-rehearsal-fixture`; and
- the pull request body names the issue — PR #14 for #8, PR #15 for #9, PR #16
  for #10.

That practice is stated in prose in `_notes/GOVERNANCE.md` rather than asserted
by a flag that means something narrower. Setting the flag `false` records that
commit messages are not the carrier; it does not withdraw the requirement to
trace work to an issue.

## Why this was worth doing

Low stakes today, higher later. A governance file that contradicts observable
history costs nothing until someone needs to know which parts of it are binding,
at which point none of it can be trusted. Cheap now, awkward once there are more
contributors.
