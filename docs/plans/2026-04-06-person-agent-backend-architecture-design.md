# Person-Agent Backend Architecture Design

**Date:** 2026-04-06

**Goal:** Evolve the archive-backed memory workspace into a front-desk plus backstage system where a single primary assistant answers the user while dynamically promoted person agents maintain independent fact memory and interaction memory for high-signal people.

**Product Boundary:** Frontend presentation is handled separately. This design only covers backend data, routing, memory, promotion, refresh, and audit behavior.

---

## 1. Outcome

The user always talks to one primary assistant. The backend may consult zero or more person agents before producing the final answer.

Each person agent represents one canonical person and is created only after that person crosses a promotion threshold. A person agent never speaks directly to the user in phase one. It supplies:

- stable fact memory
- interaction memory
- answer packs for person-centric questions
- conflict and coverage warnings

The primary assistant remains responsible for:

- user-facing wording
- multi-source synthesis
- guardrails
- review and governance escalation

---

## 2. Why This Direction Fits The Existing Codebase

The current project already has the right foundations:

- approved person facts and dossier assembly in `src/main/services/personDossierService.ts`
- person and group memory workspace responses in `src/main/services/memoryWorkspaceService.ts`
- quote-backed communication evidence reads in `src/main/services/communicationEvidenceService.ts`
- persisted workspace turns in `src/main/services/memoryWorkspaceSessionService.ts`
- bounded multi-agent runtime in `src/main/services/agents/*` and `src/main/services/objective*`

What is missing is not a new model layer. The main gap is a dedicated person-centric backend abstraction between raw archive data and final user-facing answers.

---

## 3. Phase-One Principles

### 3.1 Must Have

- one front-desk assistant
- dynamic person agents promoted from canonical people
- independent fact memory per person agent
- independent interaction memory per person agent
- event-driven refresh
- auditable answer-pack generation
- compatibility with current `Memory Workspace` response shape

### 3.2 Explicit Non-Goals

- direct free-form chat with a person agent
- full autonomous long-running person agents
- unconstrained roleplay or identity impersonation
- replacing the existing review queue or governance stack
- immediate deep integration with every objective-runtime path

---

## 4. Core Entities

### 4.1 Canonical Person

The current canonical person remains the identity anchor. Promotion never creates a second identity graph. A person agent is a runtime memory layer attached to one `canonical_person_id`.

### 4.2 Person Agent

New backend entity representing a promoted canonical person.

Suggested persistent fields:

- `person_agent_id`
- `canonical_person_id`
- `status` (`candidate`, `active`, `paused`, `demoted`)
- `promotion_score`
- `promotion_tier`
- `promotion_reason_summary`
- `facts_version`
- `interaction_version`
- `last_refreshed_at`
- `last_activated_at`
- `created_at`
- `updated_at`

### 4.3 Fact Memory

Projection-oriented memory assembled from approved facts and approved timeline/relationship views.

Suggested record shape:

- `memory_key`
- `section_key`
- `display_label`
- `summary_value`
- `memory_kind` (`fact`, `timeline`, `relationship`, `coverage_gap`, `conflict`)
- `confidence`
- `conflict_state`
- `freshness_at`
- `source_refs_json`
- `source_hash`

### 4.4 Interaction Memory

Summarized memory of how this person appears in user interaction. This is not raw chat history.

Suggested record families:

- recent question summaries
- recurring topic counters
- last cited evidence refs
- answer outcome summaries (`answered`, `conflict_redirect`, `coverage_gap`, `review_redirect`)
- last-mentioned timestamps

### 4.5 Person Answer Pack

Transient assembly returned by a person agent when consulted by the primary assistant.

Suggested fields:

- `personAgentId`
- `canonicalPersonId`
- `questionClassification`
- `candidateAnswer`
- `supportingFacts`
- `supportingCitations`
- `conflicts`
- `coverageGaps`
- `recentInteractionTopics`
- `generationReason`
- `memoryVersions`

---

## 5. Promotion Model

Promotion is score-based, not binary by file count alone.

Recommended phase-one scoring inputs:

- approved fact count
- evidence source count
- relationship degree / group connectivity
- recent question frequency in memory workspace turns
- recent citation frequency in responses

Suggested qualitative tiers:

- `cold`: ordinary canonical person, no person agent
- `warming`: promotion candidate worth tracking
- `active`: promoted person agent
- `high-signal`: promoted and favored during answer routing

Promotion rules:

- a canonical person can be promoted only if approved evidence exists
- promotion should be deterministic from persisted signals
- promotion should be recomputed after relevant events
- demotion should be conservative and explicit, never silent

---

## 6. Memory Model

### 6.1 Fact Memory

Fact memory is a projection, not a second source of truth.

Inputs:

- approved profile attributes
- timeline highlights
- relationship summary
- conflict summary
- coverage gaps

Behavior:

- refresh from approved archive views
- preserve source citations
- expose conflict state instead of flattening contradictions away
- keep hashes to avoid unnecessary rewrites

### 6.2 Interaction Memory

Interaction memory stores how the user tends to ask about this person.

Inputs:

- person-scoped memory workspace turns
- global turns that resolve to a single person
- final answer citations involving the person
- redirect / conflict / coverage outcomes

Behavior:

- aggregate by topic and outcome
- store summaries, counters, and timestamps
- avoid storing full private dialogue redundantly when an archive turn id can be referenced

---

## 7. Answer Routing

### 7.1 Front-Door Rule

The user still enters through the primary assistant.

### 7.2 Routing Flow

1. Classify the incoming question.
2. Resolve whether it targets a specific canonical person.
3. If the person has an active person agent, request a person answer pack.
4. If no active person agent exists, fall back to the existing archive-backed pack builder.
5. Synthesize the final answer in the primary assistant.
6. Apply existing conflict, citation, persona, and review guardrails.
7. Write interaction outcomes back into person-agent memory.

### 7.3 Routing Scope

Phase one should support:

- direct person-scoped questions
- global questions that resolve to exactly one person

Phase one should not attempt broad multi-person orchestration beyond choosing one primary person agent plus archive fallback.

---

## 8. Event-Driven Refresh

Person agents should refresh on explicit domain events rather than on arbitrary autonomous schedules.

Refresh triggers:

- import produced new person-linked evidence
- approved fact or reviewed projection changed
- relationship graph changed
- group portrait changed
- a user question updated interaction memory

Recommended implementation pattern:

- append refresh requests to a lightweight queue table
- coalesce repeated refresh reasons per person
- process refreshes idempotently
- record success/failure/audit rows

---

## 9. Integration Points

### 9.1 Memory Workspace

`askMemoryWorkspace` and `askMemoryWorkspacePersisted` remain the user-facing API boundary.

Phase-one backend change:

- insert a person-agent orchestration layer before current card selection logic
- preserve the existing response contract where possible
- add backend metadata for traceability if needed

### 9.2 Objective Runtime

Phase one should not rewrite the whole runtime around person agents. Instead:

- keep existing `workspace / review / governance / ingestion` roles
- allow workspace-side orchestration code to consult person agents as a bounded internal service
- postpone direct person-agent runtime participants until answer-pack behavior is proven

### 9.3 Review

Review remains the authority for high-risk facts. Person agents consume approved outputs and surface pending conflicts, but do not override review decisions.

---

## 10. Auditing

Every important person-agent action should be traceable:

- promotion decision and score
- refresh trigger and refresh result
- answer-pack generation
- final-answer consultation metadata
- interaction-memory writeback

Recommended outputs:

- journal-backed events where user-visible decisions matter
- lightweight projection/audit rows for internal refresh activity

---

## 11. Main Risks

### Risk 1: Duplicate truth models

If person-agent fact memory drifts from dossier/projection data, answers become inconsistent.

Mitigation:

- treat fact memory as a rebuildable projection
- keep source hashes and versions

### Risk 2: Over-promotion

If too many people are promoted, the system gains complexity without user value.

Mitigation:

- score-based promotion
- conservative thresholds
- candidate state before activation

### Risk 3: Interaction-memory privacy bloat

If interaction memory stores too much raw content, it becomes a second uncontrolled transcript store.

Mitigation:

- store summaries, counters, refs, and timestamps
- reference workspace turn ids rather than duplicating raw text when possible

### Risk 4: Frontend coupling too early

If backend contracts are designed around one temporary UI, Kimi Code will have to undo them later.

Mitigation:

- expose stable orchestration metadata
- keep final user-facing response shape compatible

---

## 12. Recommended Phase Split

### Phase 1

- person-agent tables and contracts
- promotion score and candidate activation
- fact-memory projection
- interaction-memory writeback
- memory-workspace routing through person answer packs

### Phase 2

- refresh queue and background runner hardening
- person-agent inspection APIs for frontend
- answer quality telemetry and score tuning

### Phase 3

- bounded objective-runtime consultation hooks
- optional direct person-agent debug surfaces for operators

---

## 13. Decision Summary

The backend should move to:

- one primary user-facing assistant
- dynamically promoted person agents
- fact plus interaction memory per promoted person
- event-driven refresh
- answer-pack consultation instead of direct user-facing person-agent chat

This matches the requested product direction while staying compatible with the current archive, review, and runtime foundations.
