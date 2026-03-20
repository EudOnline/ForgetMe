# Approved Draft Hosted Share Links Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add hosted share host config, boundary audit persistence, and journal-backed link service with create/list/revoke flows and search visibility.

**Architecture:** Introduce new SQLite boundary tables for hosted share links, wrap host API calls in a new service that reuses publication package validation, and persist decision journals for create/revoke with folded summaries. Use env-based host config (base URL + bearer token) with deterministic payload shapes; avoid leaking local paths.

**Tech Stack:** TypeScript (Node/Electron main process), SQLite migrations, fetch-based HTTP, Vitest.

---

### Task 1: Migration for hosted share link boundary audit (020)

**Files:**
- Create: `src/main/services/migrations/020_persona_draft_hosted_share_links.sql`
- Create: `tests/unit/main/dbPhaseTenMApprovedDraftHostedShareLink.test.ts`

**Step 1: Write the failing test**
- Add Vitest covering table creation, foreign keys, and required columns (`share_link_id`, `draft_review_id`, `publication_id`, `source_turn_id`, `operation_kind`, `host_kind`, `host_label`, `request_hash`).

**Step 2: Run test to verify it fails**
- `npm run test:unit -- tests/unit/main/dbPhaseTenMApprovedDraftHostedShareLink.test.ts`
- Expect failure: tables/columns missing.

**Step 3: Write minimal migration**
- Create tables `persona_draft_share_host_artifacts`, `persona_draft_share_host_events`, add indexes, foreign keys to `persona_draft_reviews` and `persona_draft_publications` and `memory_workspace_turns`.

**Step 4: Run test to verify it passes**
- Same command; expect green.

### Task 2: Approved draft hosted share link service tests

**Files:**
- Create: `tests/unit/main/approvedDraftHostedShareLinkService.test.ts`
- Modify: `tests/unit/main/helpers/memoryWorkspaceScenario.ts` (if new helpers needed)

**Step 1: Write failing tests**
- Cover host status (env missing ⇒ `unconfigured`), create null cases (missing review/not approved/no publication history), happy-path create (validates package, uploads exact files, request envelope excludes local paths, audit events + journal), revoke flow (audit events + journal, no local mutation), create failure persists error event + throws, list folds create/revoke newest-first.

**Step 2: Run tests to confirm failure**
- `npm run test:unit -- tests/unit/main/approvedDraftHostedShareLinkService.test.ts`
- Expect failures due to missing service/migrations.

### Task 3: Implement approvedDraftHostedShareLinkService + reusable publication validation

**Files:**
- Create: `src/main/services/approvedDraftHostedShareLinkService.ts`
- Modify: `src/main/services/approvedDraftPublicationService.ts`
- Modify: `src/main/services/journalService.ts`
- Modify: `src/main/services/approvedDraftPublicationHtmlService.ts` only if minor adjustments needed for validation helper (avoid unless necessary)

**Step 1: Implement reusable package validation helper in publication service**
- Extract validation of local package paths (manifest/publication/display files + sha check) so both publication listing and hosted link creation can call it.

**Step 2: Implement hosted share link service**
- Read env config, build host label, construct request envelope without local paths, POST create/revoke with bearer token, persist boundary artifacts/events, append decision journals for create/revoke, reuse publication helper to load latest publication.

**Step 3: Re-run targeted tests**
- `npm run test:unit -- tests/unit/main/approvedDraftHostedShareLinkService.test.ts`
- Expect green.

### Task 4: Journal/search integration for hosted share links

**Files:**
- Modify: `src/main/services/journalService.ts`
- Modify: `src/main/services/searchService.ts`
- Modify: `tests/unit/main/searchService.test.ts`

**Step 1: Write failing search tests**
- Add cases for finding created hosted link by `shareUrl` and revoked link by label “Hosted share link revoked”.

**Step 2: Run tests to confirm failure**
- `npm run test:unit -- tests/unit/main/searchService.test.ts`

**Step 3: Implement label/summary folding**
- Add decision labels/target summaries for hosted share create/revoke; ensure search haystack includes folded replay summaries and revoked entries fold create+revoke.

**Step 4: Re-run search tests**
- Same command; expect green.

### Task 5: Full verification and regression checks

**Files:**
- All touched files

**Step 1: Run required suite**
- `npm run test:unit -- tests/unit/main/dbPhaseTenMApprovedDraftHostedShareLink.test.ts tests/unit/main/approvedDraftHostedShareLinkService.test.ts tests/unit/main/searchService.test.ts`

**Step 2: Run publication regression if helper touched**
- `npm run test:unit -- tests/unit/main/approvedDraftPublicationService.test.ts`

**Step 3: Review code for minimal surface and env handling**
- Self-review for no path leaks, correct journal/event shapes, and env fallback.

**Step 4: Commit**
- `git add ... && git commit -m "feat: add approved draft hosted share link service"`
