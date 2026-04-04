# Agent Runtime Operator Playbook

This playbook is for running the objective runtime after the high-threshold autonomy convergence pass.

## What The Inbox Pills Mean

- `Needs operator`: the objective currently has at least one proposal or objective state that requires explicit operator action.
- `Awaiting operator: N`: `N` proposals are waiting for operator confirmation.
- `Blocked: N`: `N` proposals were blocked or rejected and need follow-up before work can continue.
- `Vetoed: N`: governance has vetoed `N` proposals.
- `Latest blocker: ...`: the newest reject or veto rationale persisted in the runtime.

## How To Triage An Objective

1. Open the objective and identify whether the stop is `awaiting_operator`, `blocked`, or `vetoed`.
2. Read the latest checkpoint and blocker rationale before taking action.
3. Check proposal risk level and autonomy decision.
4. Confirm only if the proposal is still within the intended product boundary.
5. Block or veto when the proposal crosses policy, evidence, or safety boundaries.

## How To Respond To Blocked Or Vetoed Proposals

- For `blocked`, look for missing evidence, unresolved challenge messages, or a bad execution boundary.
- For `vetoed`, treat it as a policy stop, not a request for cosmetic edits.
- Prefer asking the runtime to produce a narrower follow-up proposal instead of manually forcing the original one through.
- If a proposal should now be safe, require a new proposal with a fresh audit trail.

## When To Use The Kill Switches

Use kill switches only when runtime behavior is drifting or when you need a temporary rollback.

- `FORGETME_AGENT_DISABLE_AUTO_COMMIT=1`
  Use when you want all proposal commits to stop until explicitly confirmed.

- `FORGETME_AGENT_FORCE_OPERATOR_FOR_EXTERNAL_ACTIONS=1`
  Use when external actions feel too eager and you want a temporary tighter boundary without disabling all autonomy.

- `FORGETME_AGENT_DISABLE_NESTED_DELEGATION=1`
  Use when child subagent spawning is causing instability, excess complexity, or debugging friction.

After enabling a kill switch:

1. restart the app/runtime session
2. reproduce the affected flow
3. confirm the new behavior in the objective workbench
4. remove the switch once the incident is understood or fixed

## How To Validate Healthy Autonomy After Deploy

Run these checks:

1. Verify medium-risk reversible proposals still auto-commit.
2. Verify critical publication proposals still wait for operator confirmation.
3. Verify blocked and vetoed proposals surface cleanly in the inbox and detail view.
4. Verify objective runtime events are being written for starts, proposal creation, auto-commits, stalls, and completions.

Recommended commands:

```bash
npm run test:unit
npm run test:e2e:objective
```

## What Healthy Runtime Behavior Looks Like

- most local reversible work auto-commits
- critical proposals remain rare and explainable
- operator backlog stays small and intentional
- vetoes and blocks have explicit rationale
- stalls are visible instead of silently idling

## Escalation Rule

If you are unsure whether a proposal is merely `high` or truly `critical`, prefer keeping the current boundary and opening a follow-up review instead of silently broadening autonomy.
