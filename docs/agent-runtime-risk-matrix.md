# Agent Runtime Risk Matrix

This document freezes the product boundary for the current objective runtime release line.

## Core Rule

The runtime is highly autonomous by default.

- Local, reversible work should usually proceed automatically.
- Only truly destructive, irreversible, public, or sensitive external actions should stop for the operator by default.
- Risk decisions must come from structured runtime policy, not model prose.

## Risk Levels

### `low`

Use for bounded local work that is easy to undo and does not cross an external boundary.

Typical examples:

- spawning a local bounded subagent
- local evidence inspection
- other reversible internal orchestration steps

Default autonomy:

- `auto_commit`

### `medium`

Use for reversible local state changes that matter, but can still be audited and rolled back.

Typical examples:

- approving a review item
- rejecting a review item
- rerunning a failed local workflow
- adopting a compare recommendation
- drafting a user response inside the local runtime

Default autonomy:

- `auto_commit_with_audit`

### `high`

Use for actions that cross a meaningful evidence or workflow boundary but are still bounded and reversible.

Typical examples:

- bounded external verification
- local review actions with higher downstream impact but no irreversible publication

Default autonomy:

- `auto_commit_with_audit`

Important:

- `high` alone does not force operator confirmation in this release line.

### `critical`

Use only for genuinely high-consequence boundaries.

Typical examples:

- public publication
- irreversible destructive mutation
- sensitive external disclosure
- any other action that clearly leaves the local reversible control surface

Default autonomy:

- `await_operator`

## Cases That Always Stop For Operator

These should remain operator-gated unless the product boundary is explicitly redefined:

- publishing to a public destination
- destructive work that cannot be safely rolled back
- sensitive external egress
- any proposal explicitly downgraded by a runtime kill switch

## Kill Switch Overrides

The runtime supports explicit overrides for rollback and incident response:

- `FORGETME_AGENT_DISABLE_AUTO_COMMIT`
- `FORGETME_AGENT_FORCE_OPERATOR_FOR_EXTERNAL_ACTIONS`
- `FORGETME_AGENT_DISABLE_NESTED_DELEGATION`

These switches are emergency controls, not the normal operating mode.

## Non-Goals For This Release Line

Do not add these without a new convergence cycle:

- lower the `critical` threshold
- operator-editable live risk rules in the UI
- deeper nested delegation
- broader external tool permissions
