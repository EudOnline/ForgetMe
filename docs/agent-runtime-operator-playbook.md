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

## Using The Runtime Ops Surface

Open Objective Workbench and use the runtime ops sections in this order:

1. `Runtime health`
   Check auto-commits, operator-gated proposals, stalled objectives, and operator backlog before diving into any single objective.
2. `Recent incidents`
   Select the newest blocked, vetoed, or awaiting-operator event and inspect its structured payload before taking action.
3. `Runtime controls`
   Use the persisted kill switches only when the scorecard or incident feed shows drift, instability, or debugging pressure.

The runtime ops controls are now persisted and auditable. A setting change should survive refresh and appear in the incident / settings audit trail rather than existing only as an environment-variable override.

## When To Use The Kill Switches

Use kill switches only when runtime behavior is drifting or when you need a temporary rollback.

- `Disable auto commit`
  Use when you want all proposal commits to stop until explicitly confirmed.

- `Force operator for external actions`
  Use when external actions feel too eager and you want a temporary tighter boundary without disabling all autonomy.

- `Disable nested delegation`
  Use when child subagent spawning is causing instability, excess complexity, or debugging friction.

Environment variables still exist as engineering fallbacks, but the normal operator path is now the persisted runtime controls in Objective Workbench.

After enabling a kill switch:

1. confirm the changed setting is visible in `Runtime controls`
2. reproduce the affected flow
3. inspect `Runtime health` and `Recent incidents` for the new runtime behavior
4. remove the switch once the incident is understood or fixed

## How To Validate Healthy Autonomy After Deploy

Run these checks:

1. Verify medium-risk reversible proposals still auto-commit.
2. Verify critical publication proposals still wait for operator confirmation.
3. Verify blocked and vetoed proposals surface cleanly in the inbox and detail view.
4. Verify runtime health metrics render in Objective Workbench.
5. Verify recent incidents surface blocked or awaiting-operator events with structured payload detail.
6. Verify runtime control changes persist across refresh.
7. Verify objective runtime events are being written for starts, proposal creation, auto-commits, stalls, and completions.

Recommended commands:

```bash
npm run test:unit
npm run test:typecheck
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
