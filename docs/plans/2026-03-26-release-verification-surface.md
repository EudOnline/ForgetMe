I'm using the writing-plans skill to create the implementation plan.

# Release Verification Surface Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture the current release verification baseline with scripted npm commands, a reproducible CI workflow, and matching documentation so the release gate can be automated.

**Architecture:** Introduce a smoke suite script that runs the existing subset of Playwright specs, wrap that suite together with the existing typecheck/unit/build commands behind `verify:release`, and mirror the same chain inside a dedicated GitHub Actions workflow triggered on pushes and pull requests. Update the README so contributors run the same command locally and can see which smoke specs are included.

**Tech Stack:** npm scripts, Playwright test runner, GitHub Actions (checkout/setup-node/playwright install), Markdown documentation.

---

### Task 1: Release scripts

**Files:**
- Modify: `/Users/lvxiaoer/Documents/codeWork/ForgetMe/.worktrees/v1-release-hardening/package.json`

**Step 1: Add the release smoke suite script**
- Insert `"test:smoke:release": "npm run test:e2e -- tests/e2e/import-batch.spec.ts tests/e2e/person-review-flow.spec.ts tests/e2e/memory-workspace-flow.spec.ts tests/e2e/memory-workspace-approved-draft-hosted-share-link-flow.spec.ts"` under `scripts` so the specific Playwright specs are clearly enumerated.

**Step 2: Add the composite release verification script**
- After the existing test scripts, add `"verify:release": "npm run test:typecheck && npm run test:unit && npm run test:smoke:release && npm run build"` so it chains typecheck, unit, smoke suite, and build with no shell fallbacks.

### Task 2: CI workflow

**Files:**
- Create: `/Users/lvxiaoer/Documents/codeWork/ForgetMe/.worktrees/v1-release-hardening/.github/workflows/verify.yml`

**Step 1: Author the workflow definition**
- Create a `verify` job that runs on `push` and `pull_request`, checks out the repo, sets up Node 22 with npm caching, runs `npm ci`, installs Playwright dependencies via `npx playwright install --with-deps`, and finally runs `npm run verify:release` so the release gate executes on CI.

### Task 3: Maintainer docs

**Files:**
- Modify: `/Users/lvxiaoer/Documents/codeWork/ForgetMe/.worktrees/v1-release-hardening/README.md`

**Step 1: Update the verification section**
- Replace the existing generic test command list with a statement that the canonical verification command is `npm run verify:release` and include the list of smoke specs so contributors know which e2e files are in the suite. Keep the format consistent with the surrounding Markdown.

### Task 4: Run the release gate locally

**Step 1: Execute the new gate**
- Run `npm run verify:release` from the repo root and expect PASS (typecheck/unit/smoke/build) matching the controller-verified baseline commands.

### Task 5: Commit the changes

**Step 1: Review and stage**
- Run `git status` and `git add package.json README.md .github/workflows/verify.yml docs/plans/2026-03-26-release-verification-surface.md` so only the touched files are staged.

**Step 2: Commit**
- Commit with `git commit -m "build: add release verification gate"`.

Plan complete and saved to `docs/plans/2026-03-26-release-verification-surface.md`. Two execution options:
1. Subagent-Driven (this session) - continue here, spawn the required subagent(s), run tasks, and review between steps as described in superpowers:subagent-driven-development.
2. Parallel Session (separate) - spin up a new session that follows superpowers:executing-plans for batched execution with checkpoints.
Which approach?
