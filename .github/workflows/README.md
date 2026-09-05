# Workflows

| Workflow | File | Runs on |
| --- | --- | --- |
| `CI` | [`ci.yml`](ci.yml) | `pull_request`, and `push` to `main` |
| `Release` | [`release.yml`](release.yml) | `workflow_dispatch` |
| `Reconcile Release` | [`reconcile-release.yml`](reconcile-release.yml) | `workflow_dispatch` |

`CI` runs `npm run release:check` — the same command, install step, and pinned
action SHAs as the `Qualify release` step in `release.yml`. It is deliberately
not a faster subset: a subset would be a second definition of "passing", and
drift between what CI proves and what a release requires is the failure this
workflow exists to prevent.

## Reading the Actions tab

A red run means a real defect. That has only been true since `CI` landed, so
the older history needs the following context.

### Synthetic failures — not defects

Two red `Package Release Rehearsal` runs dated 2026-09-01:

- [`33547724757`](https://github.com/omiologic/token-counter/actions/runs/33547724757)
- [`33548325394`](https://github.com/omiologic/token-counter/actions/runs/33548325394)

That workflow hardcoded `OUTCOME: failure` and called `exit 1`. Its whole body
was one `echo` and a conditional exit; it published nothing, tagged nothing,
and ran no repository code. It existed to exercise a downstream `release.failed`
alert route in `omiologic/agentic-wx`, and both runs are it doing exactly what
it was written to do.

For a period these two runs were the entire recorded run history of this
repository, and an audit in `agentic-wx` read them as a broken release pipeline
and concluded the package could not be adopted. That conclusion was wrong: the
real `Release` workflow had not run at all yet.

The workflow was deleted once `CI` made red runs meaningful. The runs themselves
are retained on purpose: `agentic-wx` cites both by run id in
`services/webhooks/release-failure/evidence/staging-package-release-cutover.json`
— `33547724757` as a shadow-mode signed delivery, and `33548325394` as the
source of the live `release.failed` delivery that reached `project-alerts` with
`delivery_status: "succeeded"`. Deleting the runs would break that evidence
trail, so a red rehearsal run in the history is expected and meaningless.

### Real failures

Three red `Release` runs dated 2026-09-04 are genuine. They are release-gate
defects hit while publishing `0.1.0-beta.1`, at a time when `release:check` had
never passed anywhere except a developer machine. The fourth dispatch that day
succeeded and published the package. The full account is in issue #7.
