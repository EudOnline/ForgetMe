# Agent Self Server Documentation System Design

## Goal

Design a documentation system for an agent-first `self server` where agents, not humans, are the primary API consumers. The system must let an agent discover capabilities, understand safety boundaries, choose the right operation, validate inputs, interpret outputs, recover from failures, and stay aligned with the real code surface as the product evolves.

This design assumes the current repository remains the source of truth for domain contracts and API exposure:

- Zod request schemas live in `src/shared/ipcSchemas.ts`
- shared response and domain types live in `src/shared/archiveContracts.ts`
- exposed operation surface lives in `src/preload/index.ts` and `src/renderer/archiveApi.ts`
- service behavior lives in `src/main/services/*`

The documentation system should extend these sources instead of replacing them.

## Why This Exists

Traditional API docs are optimized for humans browsing endpoints. An agent-first system has different needs:

- it must be searchable and rankable by task intent, not only by endpoint name
- it must expose side effects, review boundaries, retry policy, and state transitions explicitly
- it must support machine-readable discovery at runtime
- it must fail closed when docs drift away from implementation

In this project, those needs are especially important because the operation surface spans local reads, local writes, review-gated state changes, provider-boundary outbound sends, publication flows, and recovery workflows. If an agent can only see argument shapes, it will still make bad decisions. The system therefore needs a semantic layer above raw schemas.

## Product Requirements

The documentation system must support four core jobs.

### 1. Capability Discovery

An agent must be able to answer:

- what can this server do
- which operations are read-only versus state-mutating
- which actions require human review
- which actions may call external providers
- which operations are safe to retry

### 2. Task Routing

An agent must be able to map user intent to workflow, then workflow to operations. It should discover not just `askMemoryWorkspacePersisted`, but also when that operation is preferable to `askMemoryWorkspace`, and what follow-up read or write operations usually surround it.

### 3. Contract Validation

An agent runtime or tool wrapper must be able to validate inputs and outputs against generated machine contracts derived from the same repo sources as implementation.

### 4. Change Safety

The repository must fail CI if new capabilities are added without sufficient agent-facing documentation or if documented contracts drift from code.

## Non-Goals

This system does not attempt to:

- replace implementation plans in `docs/plans/`
- replace code comments or service-level technical design
- define a public third-party API standard for external developers
- solve cloud sync, remote collaboration, or external authorization architecture
- auto-generate full prose explanations for every internal algorithm

The focus is agent usability, operational correctness, and drift resistance.

## Design Principles

### Code-Driven, Not Wiki-Driven

The documentation system must derive as much as possible from the existing typed code surface. Handwritten prose should add semantics and workflow context, not duplicate parameter lists that can be generated.

### Machine-First, Human-Readable

Every documented capability must exist in a structured manifest that an agent can parse directly. Human-readable Markdown is still required, but it should be generated from or anchored to structured metadata wherever possible.

### Intent Before Endpoint

The top-level entry point for discovery should be tasks and capabilities, not transport-specific method names. Agents work from intent such as "publish an approved draft" or "run a recovery drill", not from endpoint catalogs alone.

### Safety Semantics Are First-Class

The documentation system must represent read/write mode, side-effect level, review boundary, network egress risk, idempotency, and retry policy as explicit metadata fields rather than burying them in prose.

### Drift Must Be Detectable

Documentation is only useful if it stays true. The system must include automated checks that compare documented operations against the live operation surface and contract files.

## Proposed Information Architecture

The documentation system is split into five layers.

### Layer 1: Contract Layer

This layer represents raw request and response shapes.

Sources:

- `src/shared/ipcSchemas.ts`
- `src/shared/archiveContracts.ts`

Outputs:

- generated JSON Schema files for request payloads
- generated type manifests for shared response types
- field-level examples when available

This layer answers "what does the payload look like" and "what shape comes back".

### Layer 2: Operation Layer

This layer defines each callable capability as an operation with semantics beyond the raw payload.

Each operation record describes:

- operation id
- human summary
- intent tags
- domain
- transport
- request schema reference
- response contract reference
- side-effect level
- idempotency
- review requirement
- external network usage
- state transition summary
- retry policy
- related operations
- example calls

This is the most important new layer because it tells an agent how to reason about a tool, not just how to invoke it.

### Layer 3: Workflow Layer

This layer groups operations into task-oriented sequences.

Examples in the current project:

- import and freeze archive evidence
- run a saved `Memory Workspace` session
- compare multiple memory answers
- review and approve persona draft output
- publish a local share package
- create or revoke hosted share links
- export backup and run restore drill

Workflows define preconditions, recommended sequence, branch points, common failures, and completion criteria. They are the preferred discovery entry for autonomous agents.

### Layer 4: Policy Layer

This layer documents global rules that should constrain agent behavior.

Examples:

- local-first data handling rules
- provider-boundary egress rules
- review-gated write rules
- replay immutability rules
- retry limitations for non-idempotent operations

This gives agents a stable reasoning frame that spans multiple operations.

### Layer 5: Runtime Discovery Layer

This layer exposes the documentation system itself through a machine-facing metadata API on the self server.

Examples:

- `listCapabilities`
- `getOperationSpec`
- `getWorkflowSpec`
- `searchDocs`
- `getSchema`
- `getErrorGuide`

This makes the docs live and queryable rather than static files only.

## Repository Structure

The documentation system should introduce a dedicated agent-doc area plus generated artifacts.

```text
docs/
  agent/
    README.md
    glossary.md
    policies/
      side-effects.md
      review-boundary.md
      provider-boundary.md
      retry-and-idempotency.md
    workflows/
      import-and-freeze.md
      memory-workspace-session.md
      review-approved-draft.md
      publish-share-package.md
      create-hosted-share-link.md
      backup-and-restore.md
    operations/
      archive/
      people/
      review/
      enrichment/
      preservation/
      memory-workspace/
      approved-draft/
  generated/
    capability-index.json
    operation-index.json
    workflow-index.json
    error-index.json
    schemas/
      *.schema.json
    search-index.json
```

The code-side registry should live alongside current shared contracts:

```text
src/shared/
  agentOperationCatalog.ts
  agentWorkflowCatalog.ts
  agentPolicyCatalog.ts
  agentErrorCatalog.ts
```

These files become the semantic bridge between existing code contracts and generated documentation artifacts.

## Operation Metadata Model

Each operation must have a structured record in `agentOperationCatalog.ts`. A recommended shape is:

```ts
type AgentOperationSpec = {
  operationId: string
  transport: 'ipc' | 'http' | 'internal'
  invokeKey: string
  summary: string
  description: string
  domain:
    | 'archive'
    | 'people'
    | 'review'
    | 'enrichment'
    | 'preservation'
    | 'memory-workspace'
    | 'approved-draft'
  intentTags: string[]
  requestSchemaRef?: string
  responseContractRef?: string
  sideEffectLevel: 'read_only' | 'write_local' | 'write_review_gated' | 'write_external'
  idempotency: 'idempotent' | 'conditionally_idempotent' | 'non_idempotent'
  externalNetworkUse: 'never' | 'optional' | 'required'
  requiresHumanReview: boolean
  preconditions: string[]
  postconditions: string[]
  stateTransitions: string[]
  retryPolicy: {
    safeToAutoRetry: boolean
    guidance: string
  }
  relatedOperations: string[]
  exampleRefs: string[]
  introducedIn?: string
  stability: 'experimental' | 'stable'
}
```

This model captures what agents actually need for planning and safe execution. It should be narrow enough to maintain, but rich enough to prevent misuse.

## Workflow Metadata Model

Each workflow should have both a structured record and a human-readable guide.

Recommended structured fields:

```ts
type AgentWorkflowSpec = {
  workflowId: string
  summary: string
  domain: string
  intentTags: string[]
  preconditions: string[]
  successCriteria: string[]
  operationSequence: Array<{
    stepId: string
    operationId: string
    when: string
    onFailure?: string
  }>
  branchRules: string[]
  abortConditions: string[]
  relatedPolicies: string[]
}
```

This lets the self server return a workflow skeleton to an agent, while the Markdown guide provides deeper interpretation, examples, and tradeoffs.

## Contract Generation Strategy

The repository already stores request validation in Zod schemas. The first implementation should treat those schemas as canonical for machine-readable request contracts.

Generation pipeline:

1. Read exported schemas from `src/shared/ipcSchemas.ts`
2. Convert them into JSON Schema artifacts
3. Register schema ids in a generated schema index
4. Link operations to schema ids through `requestSchemaRef`

For response contracts, there are two acceptable stages:

- Stage 1: generate lightweight type manifests from `archiveContracts.ts` plus handwritten examples
- Stage 2: gradually introduce explicit output schemas for high-value operations

This staged approach avoids blocking adoption on perfect type reflection while still making request validation and discovery useful immediately.

## Runtime Discovery API

The self server should expose documentation metadata as first-class runtime endpoints or tools. The exact transport can vary, but the capability shape should stay stable.

Recommended runtime methods:

```text
GET /meta/capabilities
GET /meta/operations
GET /meta/operations/:operationId
GET /meta/workflows
GET /meta/workflows/:workflowId
GET /meta/schemas/:schemaId
GET /meta/errors/:errorCode
POST /meta/search
```

Recommended search filters:

- `query`
- `domain`
- `intentTag`
- `sideEffectLevel`
- `requiresHumanReview`
- `externalNetworkUse`
- `safeToAutoRetry`

The self server should rank workflow matches above raw operation matches when user intent is task-shaped rather than endpoint-shaped.

## Search and Retrieval Design

Simple full-text search is not enough. The documentation system should support semantic retrieval with structured ranking features.

Ranking signals should include:

- exact match on `intentTags`
- domain match
- operation summary match
- workflow summary match
- side-effect and review-boundary fit
- recency or stability preference

The system should return compact excerpts and structured metadata together. An ideal result payload includes:

- title
- type: capability, workflow, operation, policy, or error guide
- short summary
- direct id for machine follow-up
- risk markers
- matched tags

This lets an agent quickly choose whether to read a workflow, fetch a detailed operation spec, or inspect a policy boundary.

## Error Documentation Model

Agent systems fail more often on recovery than on first execution. Error docs therefore need their own structured index.

Each error guide should include:

- error code or error class
- likely cause
- whether the action may already have been partially applied
- whether retry is safe
- recommended diagnostic reads
- recommended compensating actions
- related operations

This is especially important in flows like provider send, hosted share creation, publication, restore, and review transitions where failure semantics are not equivalent.

## Human-Readable Authoring Format

Each operation and workflow should also have a Markdown page with frontmatter derived from the structured catalog.

Example:

```md
---
operationId: memory.ask_persisted
summary: Append a new grounded turn to a saved memory workspace session
domain: memory-workspace
transport: ipc
requestSchemaRef: askMemoryWorkspacePersistedInputSchema
responseContractRef: MemoryWorkspaceSessionTurn
sideEffectLevel: write_local
idempotency: non_idempotent
requiresHumanReview: false
externalNetworkUse: optional
stability: stable
---

## When To Use

Use this when the agent wants the answer stored as an immutable session turn.

## Avoid Using When

Avoid this for dry-run questioning or exploratory comparison where persistence is not desired.

## Failure Notes

Do not blindly retry after a timeout unless persistence status is confirmed.
```

The frontmatter powers indexing and validation; the body provides explanation and examples.

## Documentation Ownership Rules

To stay current, the documentation system must assign ownership by source category:

- request shape ownership: `ipcSchemas`
- shared type ownership: `archiveContracts`
- operation semantics ownership: operation catalog entry
- workflow reasoning ownership: workflow catalog plus workflow Markdown
- global boundary rules ownership: policy docs and policy catalog

A new operation is not considered complete unless all relevant ownership surfaces exist.

## CI and Drift Detection

The most important engineering requirement is anti-drift enforcement.

Add the following checks:

### 1. Operation Coverage Check

Compare all exposed invocation keys in `src/preload/index.ts` against registered operations in the operation catalog. CI should fail if an exposed capability is undocumented.

### 2. Schema Reference Check

Verify that every `requestSchemaRef` points to a real exported schema and every referenced generated schema artifact exists.

### 3. Example Validation Check

Validate JSON examples against the generated request schemas.

### 4. Risk Metadata Check

Require `sideEffectLevel`, `idempotency`, `externalNetworkUse`, and `requiresHumanReview` for every non-trivial operation.

### 5. Workflow Coverage Check

Require workflow docs for critical multi-step capabilities such as publication, provider send, hosted share, review decision, and restore drill.

These checks turn docs from optional narrative into a maintained system component.

## Generation Pipeline

The generation flow should be deterministic and CI-friendly.

Recommended script sequence:

1. load operation, workflow, policy, and error catalogs
2. introspect exported Zod request schemas
3. generate `docs/generated/schemas/*.schema.json`
4. generate `operation-index.json`, `workflow-index.json`, `capability-index.json`, and `search-index.json`
5. render Markdown operation and workflow pages where generation is supported
6. run validation and fail on drift

Suggested script entry points:

```text
scripts/docs/build-agent-docs.ts
scripts/docs/check-agent-docs.ts
scripts/docs/render-agent-pages.ts
```

The build script should be cheap enough to run in CI and locally before merge.

## Security and Boundary Considerations

The documentation system should never encourage agents to use the most powerful write path by default. It must bias discovery toward the safest fitting operation.

Specific requirements:

- read-only operations should be clearly preferred in search when they satisfy the intent
- external provider calls must be labeled as outbound boundary crossings
- review-gated operations must signal that they mutate formal state
- non-idempotent operations must warn against blind retries
- restore and publication workflows must clearly mark filesystem side effects

This mirrors the product's existing local-first and auditable-boundary design.

## Rollout Plan

The system should be introduced in three phases.

### Phase 1: Capability Baseline

Ship the structured operation catalog, workflow catalog for top flows, generated request schemas, and metadata endpoints for capabilities and operations.

Success condition:

- agents can discover what the server can do
- every exposed operation has semantic metadata

### Phase 2: Search and Error Intelligence

Add indexed search, error guides, example validation, and richer workflow docs.

Success condition:

- agents can recover from common failures without bespoke prompt knowledge

### Phase 3: Response Contract Hardening

Expand from request-schema generation into stronger output contracts and compatibility policy.

Success condition:

- agents can reason about output shape changes and compatibility guarantees more safely

## Recommended First-Slice Scope

The first implementation should cover the highest-value agent-facing domains already present in the repo:

- `memory-workspace`
- `approved-draft`
- `review`
- `preservation`

These are the most workflow-heavy and boundary-sensitive areas, so they deliver the most immediate value from structured docs.

Recommended first workflows:

- `memory-workspace-persisted-session`
- `persona-draft-review-to-approval`
- `approved-draft-publication`
- `approved-draft-hosted-share-link`
- `approved-draft-provider-send-and-retry`
- `backup-export-and-restore-drill`

## Open Questions

The following questions do not block the documentation system design, but they affect implementation depth:

1. Will the self server expose only current IPC-backed capabilities, or also future HTTP-native tools
2. Should response schemas remain lightweight manifests for now, or should high-risk outputs get explicit output schemas early
3. Will the discovery API be consumed directly by in-process agents, external agents, or both
4. Should search ranking remain rule-based at first, or include embedding-based semantic retrieval later

The recommended assumption for implementation is:

- support both current IPC-backed capabilities and future server-native operations
- start rule-based and structured before adding retrieval complexity
- prioritize request-schema truth and semantic operation metadata before perfect output typing

## Recommendation

Build the documentation system as a code-driven semantic layer on top of the existing repo contracts, not as a separate wiki or a pure OpenAPI export. The self server should be able to answer three questions for any agent at runtime:

- what can I do
- what is safe to do
- what should I do next

If the system can answer those reliably, it will serve autonomous agents far better than traditional endpoint documentation while staying aligned with the repository's existing architecture and safety model.
