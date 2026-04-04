import type {
  AgentArtifactRef,
  AgentCheckpointKind,
  AgentCheckpointMetadata,
  AgentCheckpointRecord,
  AgentExecutionBudget,
  AgentMessageKind,
  AgentMessageRecordV2,
  AgentObjectiveDetail,
  AgentObjectiveInitiator,
  AgentObjectiveKind,
  AgentObjectiveRecord,
  AgentObjectiveRiskLevel,
  AgentObjectiveStatus,
  AgentParticipantKind,
  AgentProposalKind,
  AgentProposalAutonomyDecision,
  AgentProposalRecord,
  AgentProposalRiskLevel,
  AgentProposalStatus,
  AgentSkillPackId,
  AcknowledgeObjectiveRuntimeAlertInput,
  ListObjectiveRuntimeEventsInput,
  ListObjectiveRuntimeAlertsInput,
  ObjectiveRuntimeEventRecord,
  ObjectiveRuntimeScorecard,
  ObjectiveRuntimeAlertRecord,
  ObjectiveRuntimeSettingsRecord,
  ResolveObjectiveRuntimeAlertInput,
  AgentSubagentRecord,
  AgentSubagentStatus,
  AgentThreadDetail,
  AgentThreadKind,
  AgentThreadParticipantRecord,
  AgentThreadRecord,
  AgentThreadStatus,
  AgentToolExecutionRecord,
  AgentToolExecutionStatus,
  AgentVoteRecord,
  AgentVoteValue,
  ConfirmAgentProposalInput,
  CreateAgentObjectiveInput,
  CreateAgentProposalInput,
  GetAgentObjectiveInput,
  GetAgentThreadInput,
  ListAgentObjectivesInput,
  RespondToAgentProposalInput,
  UpdateObjectiveRuntimeSettingsInput,
} from './objectiveRuntimeContracts'

export type ImportBatchSummary = {
  batchId: string
  sourceLabel: string
  createdAt: string
  summary?: {
    frozenCount: number
    parsedCount: number
    duplicateCount: number
    reviewCount: number
  }
  files?: Array<{
    fileId: string
    fileName: string
    duplicateClass: string
    parserStatus: string
    frozenAbsolutePath: string
  }>
}

export type ArchiveSearchResult = {
  fileId: string
  batchId: string
  fileName: string
  fileKind: string
  duplicateClass: string
  parserStatus: string
  matchedPeople: string[]
}

export type ApprovedStructuredField = {
  fileId: string
  fieldType: string
  fieldKey: string
  documentType: string
  value: string
}

export type EnrichmentJob = {
  id: string
  fileId: string
  fileName: string
  enhancerType: string
  provider: string
  model: string
  status: string
  attemptCount: number
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type EnrichmentAttempt = {
  id: string
  jobId: string
  fileId: string
  fileName: string
  attemptIndex: number
  provider: string
  model: string
  status: string
  startedAt: string
  finishedAt: string | null
  errorKind: string | null
  errorMessage: string | null
  usage: Record<string, unknown>
  createdAt: string
}

export type ProviderEgressEvent = {
  id: string
  eventType: 'request' | 'response' | 'error'
  payload: Record<string, unknown>
  createdAt: string
}

export type ProviderEgressArtifact = {
  artifactId: string
  jobId: string
  fileId: string
  fileName: string
  provider: string
  model: string
  enhancerType: string
  policyKey: string
  requestHash: string
  redactionSummary: Record<string, unknown>
  createdAt: string
  events: ProviderEgressEvent[]
}

export type StructuredFieldCandidate = {
  id: string
  fileId: string
  jobId: string
  fieldType: string
  fieldKey: string
  fieldValue: string
  documentType: string
  confidence: number
  riskLevel: string
  sourcePage: number | null
  status: string
  createdAt: string
  reviewedAt: string | null
  reviewNote: string | null
  queueItemId: string | null
}

export type PersonProfileAttribute = {
  id: string
  canonicalPersonId: string
  attributeGroup: string
  attributeKey: string
  valueJson: string
  displayValue: string
  sourceFileId: string | null
  sourceEvidenceId: string | null
  sourceCandidateId: string | null
  provenance: Record<string, unknown>
  confidence: number
  status: string
  approvedJournalId: string | null
  createdAt: string
  updatedAt: string
}

export type ProfileAttributeCandidate = {
  id: string
  proposedCanonicalPersonId: string | null
  sourceFileId: string | null
  sourceEvidenceId: string | null
  sourceCandidateId: string | null
  attributeGroup: string
  attributeKey: string
  valueJson: string
  displayValue: string
  proposalBasis: Record<string, unknown>
  reasonCode: string
  confidence: number
  status: string
  createdAt: string
  reviewedAt: string | null
  reviewNote: string | null
  approvedJournalId: string | null
  queueItemId: string | null
}

export type DocumentEvidence = {
  fileId: string
  fileName: string
  rawText: string
  layoutBlocks: Array<{
    page: number
    text: string
    bbox?: number[]
  }>
  approvedFields: ApprovedStructuredField[]
  fieldCandidates: StructuredFieldCandidate[]
}

export type CanonicalPersonSummary = {
  id: string
  primaryDisplayName: string
  normalizedName: string
  aliasCount: number
  firstSeenAt: string | null
  lastSeenAt: string | null
  status: string
  evidenceCount: number
}

export type CanonicalPersonDetail = CanonicalPersonSummary & {
  manualLabels: string[]
  aliases: Array<{
    displayName: string
    sourceType: string
    confidence: number
  }>
  approvedFields?: ApprovedStructuredField[]
  approvedProfile?: Record<string, PersonProfileAttribute[]>
}

export type PersonTimelineEvent = {
  eventId: string
  title: string
  timeStart: string
  timeEnd: string
  summary: string | null
  evidence: Array<{
    fileId: string
    batchId: string | null
    fileName: string
    extension: string | null
    enrichmentSignals?: string[]
  }>
}

export type PersonGraph = {
  nodes: Array<{
    id: string
    primaryDisplayName: string
  }>
  edges: Array<{
    fromPersonId: string
    toPersonId: string
    status: 'approved'
    sharedFileCount: number
    evidenceFileIds: string[]
    manualLabel?: string
  }>
}

export const DOSSIER_DISPLAY_TYPES = [
  'approved_fact',
  'derived_summary',
  'open_conflict',
  'coverage_gap'
] as const

export type DossierDisplayType = (typeof DOSSIER_DISPLAY_TYPES)[number]

export type PersonDossierEvidenceRef = {
  kind: 'file' | 'evidence' | 'candidate' | 'journal'
  id: string
  label: string
}

export type PersonDossierIdentityCard = {
  primaryDisplayName: string
  aliases: string[]
  manualLabels: string[]
  firstSeenAt: string | null
  lastSeenAt: string | null
  evidenceCount: number
  displayType: DossierDisplayType
}

export type PersonDossierSectionItem = {
  id: string
  label: string
  value: string
  displayType: DossierDisplayType
  evidenceRefs: PersonDossierEvidenceRef[]
}

export type PersonDossierSection = {
  sectionKey: string
  title: string
  displayType: DossierDisplayType
  items: PersonDossierSectionItem[]
}

export type PersonDossierTimelineHighlight = {
  eventId: string
  title: string
  timeStart: string
  timeEnd: string
  summary: string | null
  displayType: DossierDisplayType
  evidenceRefs: PersonDossierEvidenceRef[]
}

export type PersonDossierRelationshipSummary = {
  personId: string
  displayName: string
  sharedFileCount: number
  manualLabel: string | null
  displayType: DossierDisplayType
  evidenceRefs: PersonDossierEvidenceRef[]
}

export type PersonDossierConflictSummary = {
  fieldKey: string | null
  title: string
  pendingCount: number
  distinctValues: string[]
  displayType: 'open_conflict'
}

export type PersonDossierGapSummary = {
  gapKey: string
  title: string
  detail: string
  displayType: 'coverage_gap'
}

export type PersonDossierReviewShortcut = {
  label: string
  canonicalPersonId: string
  fieldKey?: string
  hasConflict?: boolean
  queueItemId?: string
}

export type PersonDossier = {
  person: CanonicalPersonDetail
  identityCard: PersonDossierIdentityCard
  thematicSections: PersonDossierSection[]
  timelineHighlights: PersonDossierTimelineHighlight[]
  relationshipSummary: PersonDossierRelationshipSummary[]
  conflictSummary: PersonDossierConflictSummary[]
  coverageGaps: PersonDossierGapSummary[]
  reviewShortcuts: PersonDossierReviewShortcut[]
  evidenceBacktrace: PersonDossierEvidenceRef[]
}

export type GroupPortraitMemberSummary = {
  personId: string
  displayName: string
  sharedFileCount: number
  sharedEventCount: number
  connectionCount: number
  manualLabel: string | null
  isAnchor: boolean
  displayType: 'approved_fact' | 'derived_summary'
}

export type GroupPortraitBrowseSummary = {
  anchorPersonId: string
  anchorDisplayName: string
  title: string
  memberCount: number
  sharedEventCount: number
  sharedEvidenceSourceCount: number
  densityRatio: number
  membersPreview: string[]
  displayType: 'derived_summary'
}

export type GroupPortraitRelationshipDensity = {
  memberCount: number
  actualEdgeCount: number
  possibleEdgeCount: number
  densityRatio: number
  displayType: 'derived_summary' | 'coverage_gap'
}

export type GroupPortraitSharedEvent = {
  eventId: string
  title: string
  timeStart: string
  timeEnd: string
  memberCount: number
  members: string[]
  evidenceRefs: PersonDossierEvidenceRef[]
  displayType: 'approved_fact'
}

export type GroupPortraitTimelineWindow = {
  windowId: string
  title: string
  timeStart: string
  timeEnd: string
  eventCount: number
  memberCount: number
  members: string[]
  eventTitles: string[]
  displayType: 'approved_fact' | 'derived_summary'
}

export type GroupPortraitNarrativeSummary = {
  summaryId: string
  text: string
  displayType: 'derived_summary' | 'open_conflict' | 'coverage_gap'
}

export type GroupPortraitSharedEvidenceSource = {
  fileId: string
  fileName: string
  memberCount: number
  members: string[]
  displayType: 'approved_fact'
}

export type GroupPortraitReplayShortcut = {
  journalId: string
  label: string
  query: string
  displayType: 'approved_fact'
}

export type GroupPortraitCentralPersonSummary = {
  personId: string
  displayName: string
  connectionCount: number
  sharedFileCount: number
  sharedEventCount: number
  displayType: 'derived_summary'
}

export type GroupPortraitAmbiguitySummary = {
  pendingReviewCount: number
  conflictGroupCount: number
  affectedMemberCount: number
  displayType: 'open_conflict' | 'derived_summary'
  reviewShortcut: PersonDossierReviewShortcut | null
}

export type GroupPortrait = {
  anchorPersonId: string
  title: string
  members: GroupPortraitMemberSummary[]
  relationshipDensity: GroupPortraitRelationshipDensity
  sharedEvents: GroupPortraitSharedEvent[]
  timelineWindows: GroupPortraitTimelineWindow[]
  narrativeSummary: GroupPortraitNarrativeSummary[]
  sharedEvidenceSources: GroupPortraitSharedEvidenceSource[]
  replayShortcuts: GroupPortraitReplayShortcut[]
  centralPeople: GroupPortraitCentralPersonSummary[]
  ambiguitySummary: GroupPortraitAmbiguitySummary
}

export type MemoryWorkspaceScope =
  | { kind: 'global' }
  | { kind: 'person'; canonicalPersonId: string }
  | { kind: 'group'; anchorPersonId: string }

export type MemoryWorkspaceCitation = {
  citationId: string
  kind: 'person' | 'group' | 'file' | 'journal' | 'review'
  targetId: string
  label: string
}

export type MemoryWorkspaceContextCard = {
  cardId: string
  title: string
  body: string
  displayType: DossierDisplayType
  citations: MemoryWorkspaceCitation[]
}

export type MemoryWorkspaceAnswer = {
  summary: string
  displayType: DossierDisplayType
  citations: MemoryWorkspaceCitation[]
}

export type MemoryWorkspaceGuardrailDecision =
  | 'grounded_answer'
  | 'fallback_to_conflict'
  | 'fallback_insufficient_evidence'
  | 'fallback_unsupported_request'
  | 'sandbox_review_required'

export type MemoryWorkspaceGuardrailReasonCode =
  | 'open_conflict_present'
  | 'coverage_gap_present'
  | 'insufficient_citations'
  | 'multi_source_synthesis'
  | 'persona_request'
  | 'persona_draft_sandbox'
  | 'quote_trace_required'
  | 'review_pressure_present'

export type MemoryWorkspaceGuardrail = {
  decision: MemoryWorkspaceGuardrailDecision
  reasonCodes: MemoryWorkspaceGuardrailReasonCode[]
  citationCount: number
  sourceKinds: MemoryWorkspaceCitation['kind'][]
  fallbackApplied: boolean
}

export type MemoryWorkspaceExpressionMode = 'grounded' | 'advice'
export type MemoryWorkspaceWorkflowKind = 'default' | 'persona_draft_sandbox'

export type MemoryWorkspaceBoundaryRedirectReason =
  | 'persona_request'
  | 'delegation_not_allowed'
  | 'style_evidence_unavailable'

export type MemoryWorkspaceSuggestedAsk = {
  label: string
  question: string
  expressionMode: MemoryWorkspaceExpressionMode
  rationale: string
}

export type MemoryWorkspaceSuggestedAction =
  | ({
      kind: 'ask'
    } & MemoryWorkspaceSuggestedAsk)
  | {
      kind: 'open_persona_draft_sandbox'
      workflowKind: 'persona_draft_sandbox'
      label: string
      question: string
      expressionMode: MemoryWorkspaceExpressionMode
      rationale: string
    }

export type MemoryWorkspaceBoundaryRedirect = {
  kind: 'persona_request'
  title: string
  message: string
  reasons: MemoryWorkspaceBoundaryRedirectReason[]
  suggestedActions: MemoryWorkspaceSuggestedAction[]
}

export type MemoryWorkspaceCommunicationExcerpt = {
  excerptId: string
  fileId: string
  fileName: string
  ordinal: number
  speakerDisplayName: string | null
  text: string
}

export type MemoryWorkspaceCommunicationEvidence = {
  title: string
  summary: string
  excerpts: MemoryWorkspaceCommunicationExcerpt[]
}

export type MemoryWorkspacePersonaDraftTrace = {
  traceId: string
  excerptIds: string[]
  explanation: string
}

export type MemoryWorkspacePersonaDraft = {
  title: string
  disclaimer: string
  draft: string
  reviewState: 'review_required'
  supportingExcerpts: string[]
  trace: MemoryWorkspacePersonaDraftTrace[]
}

export type MemoryWorkspacePersonaDraftReviewStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'rejected'

export type MemoryWorkspacePersonaDraftReviewRecord = {
  draftReviewId: string
  sourceTurnId: string
  scope: MemoryWorkspaceScope
  workflowKind: 'persona_draft_sandbox'
  status: MemoryWorkspacePersonaDraftReviewStatus
  baseDraft: string
  editedDraft: string
  reviewNotes: string
  supportingExcerpts: string[]
  trace: MemoryWorkspacePersonaDraftTrace[]
  approvedJournalId: string | null
  rejectedJournalId: string | null
  createdAt: string
  updatedAt: string
}

export type MemoryWorkspaceResponse = {
  scope: MemoryWorkspaceScope
  question: string
  expressionMode: MemoryWorkspaceExpressionMode
  workflowKind: MemoryWorkspaceWorkflowKind
  title: string
  answer: MemoryWorkspaceAnswer
  contextCards: MemoryWorkspaceContextCard[]
  guardrail: MemoryWorkspaceGuardrail
  boundaryRedirect: MemoryWorkspaceBoundaryRedirect | null
  communicationEvidence: MemoryWorkspaceCommunicationEvidence | null
  personaDraft: MemoryWorkspacePersonaDraft | null
}

export type AskMemoryWorkspaceInput = {
  scope: MemoryWorkspaceScope
  question: string
  expressionMode?: MemoryWorkspaceExpressionMode
  workflowKind?: MemoryWorkspaceWorkflowKind
}

export type MemoryWorkspaceCompareTarget =
  | {
      targetId: string
      label: string
      executionMode: 'local_baseline'
    }
  | {
      targetId: string
      label: string
      executionMode: 'provider_model'
      provider: 'siliconflow' | 'openrouter'
      model: string
    }

export type RunMemoryWorkspaceCompareJudgeInput = {
  enabled: boolean
  provider?: 'siliconflow' | 'openrouter'
  model?: string
}

export type RunMemoryWorkspaceCompareInput = {
  scope: MemoryWorkspaceScope
  question: string
  expressionMode?: MemoryWorkspaceExpressionMode
  workflowKind?: MemoryWorkspaceWorkflowKind
  judge?: RunMemoryWorkspaceCompareJudgeInput
  targets?: MemoryWorkspaceCompareTarget[]
}

export type MemoryWorkspaceCompareMatrixRowInput = {
  label?: string
  scope: MemoryWorkspaceScope
  question: string
}

export type RunMemoryWorkspaceCompareMatrixInput = {
  title?: string
  expressionMode?: MemoryWorkspaceExpressionMode
  rows: MemoryWorkspaceCompareMatrixRowInput[]
  judge?: RunMemoryWorkspaceCompareJudgeInput
  targets?: MemoryWorkspaceCompareTarget[]
}

export type MemoryWorkspaceSessionSummary = {
  sessionId: string
  scope: MemoryWorkspaceScope
  title: string
  latestQuestion: string | null
  turnCount: number
  createdAt: string
  updatedAt: string
}

export type MemoryWorkspaceTurnRecord = {
  turnId: string
  sessionId: string
  ordinal: number
  question: string
  response: MemoryWorkspaceResponse
  provider: string | null
  model: string | null
  contextHash: string
  promptHash: string
  createdAt: string
}

export type MemoryWorkspaceSessionDetail = MemoryWorkspaceSessionSummary & {
  turns: MemoryWorkspaceTurnRecord[]
}

export type AskMemoryWorkspacePersistedInput = AskMemoryWorkspaceInput & {
  sessionId?: string
}

export type GetPersonaDraftReviewByTurnInput = {
  turnId: string
}

export type CreatePersonaDraftReviewFromTurnInput = {
  turnId: string
}

export type UpdatePersonaDraftReviewInput = {
  draftReviewId: string
  editedDraft?: string
  reviewNotes?: string
}

export type TransitionPersonaDraftReviewInput = {
  draftReviewId: string
  status: MemoryWorkspacePersonaDraftReviewStatus
}

export type ApprovedPersonaDraftHandoffKind = 'local_json_export'

export type ApprovedPersonaDraftHandoffArtifact = {
  formatVersion: 'phase10e1'
  handoffKind: ApprovedPersonaDraftHandoffKind
  exportedAt: string
  draftReviewId: string
  sourceTurnId: string
  scope: MemoryWorkspaceScope
  workflowKind: 'persona_draft_sandbox'
  reviewStatus: 'approved'
  question: string
  approvedDraft: string
  reviewNotes: string
  supportingExcerptIds: string[]
  communicationExcerpts: MemoryWorkspaceCommunicationExcerpt[]
  trace: MemoryWorkspacePersonaDraftTrace[]
  shareEnvelope: {
    requestShape: 'local_json_persona_draft_handoff'
    policyKey: 'persona_draft.local_export_approved'
  }
}

export type ApprovedPersonaDraftHandoffRecord = {
  journalId: string
  draftReviewId: string
  sourceTurnId: string
  handoffKind: ApprovedPersonaDraftHandoffKind
  status: 'exported'
  filePath: string
  fileName: string
  sha256: string
  exportedAt: string
}

export type ListApprovedPersonaDraftHandoffsInput = {
  draftReviewId: string
}

export type ExportApprovedPersonaDraftInput = {
  draftReviewId: string
  destinationRoot: string
}

export type ExportApprovedPersonaDraftResult = {
  status: 'exported'
  journalId: string
  draftReviewId: string
  handoffKind: ApprovedPersonaDraftHandoffKind
  filePath: string
  fileName: string
  sha256: string
  exportedAt: string
}

export type ApprovedDraftPublicationKind = 'local_share_package'

export type ApprovedPersonaDraftPublicationArtifact = {
  formatVersion: 'phase10k1'
  publicationKind: ApprovedDraftPublicationKind
  publishedAt: string
  publicationId: string
  title: string
  question: string
  approvedDraft: string
  shareEnvelope: {
    requestShape: 'local_share_persona_draft_publication'
    policyKey: 'persona_draft.local_publish_share'
  }
}

export type ApprovedPersonaDraftPublicationRecord = {
  journalId: string
  publicationId: string
  draftReviewId: string
  sourceTurnId: string
  publicationKind: ApprovedDraftPublicationKind
  status: 'published'
  packageRoot: string
  manifestPath: string
  publicArtifactPath: string
  publicArtifactFileName: string
  publicArtifactSha256: string
  displayEntryPath: string
  displayEntryFileName: 'index.html'
  publishedAt: string
}

export type ListApprovedPersonaDraftPublicationsInput = {
  draftReviewId: string
}

export type PublishApprovedPersonaDraftInput = {
  draftReviewId: string
  destinationRoot: string
}

export type OpenApprovedDraftPublicationEntryInput = {
  entryPath: string
}

export type OpenApprovedDraftPublicationEntryResult = {
  status: 'opened' | 'failed'
  entryPath: string
  errorMessage: string | null
}

type ConfiguredApprovedDraftHostedShareHostStatus = {
  availability: 'configured'
  hostKind: 'configured_remote_host'
  hostLabel: string
}

type UnconfiguredApprovedDraftHostedShareHostStatus = {
  availability: 'unconfigured'
  hostKind: null
  hostLabel: null
}

export type ApprovedDraftHostedShareHostStatus =
  | ConfiguredApprovedDraftHostedShareHostStatus
  | UnconfiguredApprovedDraftHostedShareHostStatus

type ApprovedPersonaDraftHostedShareLinkRecordBase = {
  shareLinkId: string
  publicationId: string
  draftReviewId: string
  sourceTurnId: string
  hostKind: 'configured_remote_host'
  hostLabel: string
  remoteShareId: string
  shareUrl: string
  publicArtifactSha256: string
  createdAt: string
}

type ActiveApprovedPersonaDraftHostedShareLinkRecord = ApprovedPersonaDraftHostedShareLinkRecordBase & {
  status: 'active'
  revokedAt: null
}

type RevokedApprovedPersonaDraftHostedShareLinkRecord = ApprovedPersonaDraftHostedShareLinkRecordBase & {
  status: 'revoked'
  revokedAt: string
}

export type ApprovedPersonaDraftHostedShareLinkRecord =
  | ActiveApprovedPersonaDraftHostedShareLinkRecord
  | RevokedApprovedPersonaDraftHostedShareLinkRecord

export type ListApprovedPersonaDraftHostedShareLinksInput = {
  draftReviewId: string
}

export type CreateApprovedPersonaDraftHostedShareLinkInput = {
  draftReviewId: string
}

export type CreateApprovedPersonaDraftHostedShareLinkResult = ApprovedPersonaDraftHostedShareLinkRecord

export type RevokeApprovedPersonaDraftHostedShareLinkInput = {
  shareLinkId: string
}

export type RevokeApprovedPersonaDraftHostedShareLinkResult = ApprovedPersonaDraftHostedShareLinkRecord

export type OpenApprovedDraftHostedShareLinkInput = {
  shareUrl: string
}

export type OpenApprovedDraftHostedShareLinkResult = {
  status: 'opened' | 'failed'
  shareUrl: string
  errorMessage: string | null
}

export type PublishApprovedPersonaDraftResult = {
  status: 'published'
  journalId: string
  publicationId: string
  draftReviewId: string
  sourceTurnId: string
  publicationKind: ApprovedDraftPublicationKind
  packageRoot: string
  manifestPath: string
  publicArtifactPath: string
  publicArtifactFileName: string
  publicArtifactSha256: string
  displayEntryPath: string
  displayEntryFileName: 'index.html'
  publishedAt: string
}

export type ApprovedDraftSendDestination = {
  destinationId: string
  label: string
  resolutionMode: 'memory_dialogue_default' | 'provider_model'
  provider: 'siliconflow' | 'openrouter'
  model: string
  isDefault: boolean
}

export type ApprovedPersonaDraftProviderSendEvent = {
  id: string
  eventType: 'request' | 'response' | 'error'
  payload: Record<string, unknown>
  createdAt: string
}

export type ApprovedDraftProviderSendAttemptKind = 'initial_send' | 'manual_retry' | 'automatic_retry'

export type ApprovedDraftProviderSendBackgroundRetryStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'exhausted'

export type ApprovedDraftProviderSendBackgroundRetry = {
  status: ApprovedDraftProviderSendBackgroundRetryStatus
  autoRetryAttemptIndex: number | null
  maxAutoRetryAttempts: number
  nextRetryAt: string | null
  claimedAt: string | null
}

export type ApprovedPersonaDraftProviderSendArtifact = {
  artifactId: string
  draftReviewId: string
  sourceTurnId: string
  provider: string
  model: string
  policyKey: string
  requestHash: string
  destinationId: string
  destinationLabel: string
  attemptKind: ApprovedDraftProviderSendAttemptKind
  retryOfArtifactId: string | null
  backgroundRetry: ApprovedDraftProviderSendBackgroundRetry | null
  redactionSummary: Record<string, unknown>
  createdAt: string
  events: ApprovedPersonaDraftProviderSendEvent[]
}

export type ListApprovedPersonaDraftProviderSendsInput = {
  draftReviewId: string
}

export type SendApprovedPersonaDraftToProviderInput = {
  draftReviewId: string
  destinationId?: string
}

export type RetryApprovedPersonaDraftProviderSendInput = {
  artifactId: string
}

export type SendApprovedPersonaDraftToProviderResult = {
  status: 'responded'
  artifactId: string
  draftReviewId: string
  sourceTurnId: string
  provider: string
  model: string
  policyKey: string
  requestHash: string
  destinationId: string
  destinationLabel: string
  attemptKind: ApprovedDraftProviderSendAttemptKind
  retryOfArtifactId: string | null
  createdAt: string
}

export type MemoryWorkspaceCompareRunStatus = 'completed' | 'failed'

export type MemoryWorkspaceCompareEvaluationDimensionKey =
  | 'groundedness'
  | 'traceability'
  | 'guardrail_alignment'
  | 'usefulness'

export type MemoryWorkspaceCompareEvaluationDimension = {
  key: MemoryWorkspaceCompareEvaluationDimensionKey
  label: string
  score: number
  maxScore: number
  rationale: string
}

export type MemoryWorkspaceCompareRunEvaluation = {
  totalScore: number
  maxScore: number
  band: 'strong' | 'acceptable' | 'fallback' | 'failed'
  dimensions: MemoryWorkspaceCompareEvaluationDimension[]
}

export type MemoryWorkspaceCompareJudgeDecision = 'aligned' | 'needs_review' | 'not_grounded'

export type MemoryWorkspaceCompareJudgeVerdict = {
  status: 'completed' | 'failed' | 'skipped'
  provider: 'siliconflow' | 'openrouter' | null
  model: string | null
  decision: MemoryWorkspaceCompareJudgeDecision | null
  score: number | null
  rationale: string | null
  strengths: string[]
  concerns: string[]
  errorMessage: string | null
  createdAt: string | null
}

export type MemoryWorkspaceCompareRecommendation = {
  source: 'deterministic' | 'judge_assisted'
  decision: 'recommend_run' | 'no_recommendation'
  recommendedCompareRunId: string | null
  recommendedTargetLabel: string | null
  rationale: string
}

export type MemoryWorkspaceCompareSessionJudgeSummary = {
  enabled: boolean
  status: 'disabled' | 'completed' | 'failed' | 'mixed'
}

export type MemoryWorkspaceCompareSessionMetadata = {
  targetLabels: string[]
  failedRunCount: number
  judge: MemoryWorkspaceCompareSessionJudgeSummary
}

export type MemoryWorkspaceCompareRunRecord = {
  compareRunId: string
  compareSessionId: string
  ordinal: number
  target: MemoryWorkspaceCompareTarget
  provider: string | null
  model: string | null
  status: MemoryWorkspaceCompareRunStatus
  errorMessage: string | null
  response: MemoryWorkspaceResponse | null
  evaluation: MemoryWorkspaceCompareRunEvaluation
  judge: MemoryWorkspaceCompareJudgeVerdict
  contextHash: string
  promptHash: string
  createdAt: string
}

export type MemoryWorkspaceCompareSessionSummary = {
  compareSessionId: string
  scope: MemoryWorkspaceScope
  title: string
  question: string
  expressionMode: MemoryWorkspaceExpressionMode
  workflowKind: MemoryWorkspaceWorkflowKind
  runCount: number
  metadata: MemoryWorkspaceCompareSessionMetadata
  recommendation: MemoryWorkspaceCompareRecommendation | null
  createdAt: string
  updatedAt: string
}

export type MemoryWorkspaceCompareSessionDetail = MemoryWorkspaceCompareSessionSummary & {
  runs: MemoryWorkspaceCompareRunRecord[]
}

export type MemoryWorkspaceCompareMatrixRowRecord = {
  matrixRowId: string
  matrixSessionId: string
  ordinal: number
  label: string | null
  scope: MemoryWorkspaceScope
  question: string
  status: 'completed' | 'failed'
  errorMessage: string | null
  compareSessionId: string | null
  recommendedCompareRunId: string | null
  recommendedTargetLabel: string | null
  failedRunCount: number
  createdAt: string
}

export type MemoryWorkspaceCompareMatrixSummary = {
  matrixSessionId: string
  title: string
  expressionMode: MemoryWorkspaceExpressionMode
  rowCount: number
  completedRowCount: number
  failedRowCount: number
  metadata: {
    targetLabels: string[]
    judge: MemoryWorkspaceCompareSessionJudgeSummary
  }
  createdAt: string
  updatedAt: string
}

export type MemoryWorkspaceCompareMatrixDetail = MemoryWorkspaceCompareMatrixSummary & {
  rows: MemoryWorkspaceCompareMatrixRowRecord[]
}

export const CONTEXT_PACK_EXPORT_MODES = [
  'approved_only',
  'approved_plus_derived'
] as const

export type ContextPackExportMode = (typeof CONTEXT_PACK_EXPORT_MODES)[number]

export type ContextPackScope =
  | { kind: 'person'; canonicalPersonId: string }
  | { kind: 'group'; anchorPersonId: string }

export type ContextPackSourceRef = {
  kind: 'person' | 'group' | 'file' | 'journal' | 'review' | 'evidence' | 'candidate'
  id: string
  label: string
}

export type ContextPackSectionItem = {
  id: string
  label: string
  value: string
  displayType: DossierDisplayType
  sourceRefs: ContextPackSourceRef[]
}

export type ContextPackSection = {
  sectionKey: string
  title: string
  displayType: DossierDisplayType
  items: ContextPackSectionItem[]
}

export type ContextPackTimelineEntry = {
  id: string
  title: string
  timeStart: string
  timeEnd: string
  summary: string | null
  displayType: DossierDisplayType
  sourceRefs: ContextPackSourceRef[]
}

export type ContextPackRelationshipEntry = {
  personId: string
  label: string
  sharedFileCount: number
  displayType: DossierDisplayType
  sourceRefs: ContextPackSourceRef[]
}

export type ContextPackAmbiguitySummary = {
  id: string
  title: string
  detail: string
  displayType: 'open_conflict' | 'coverage_gap'
  sourceRefs: ContextPackSourceRef[]
}

export type ContextPackNarrativeEntry = {
  id: string
  text: string
  displayType: DossierDisplayType
  sourceRefs: ContextPackSourceRef[]
}

export type ContextPackGroupMember = {
  personId: string
  displayName: string
  isAnchor: boolean
  sharedFileCount: number
  sharedEventCount: number
  displayType: 'approved_fact' | 'derived_summary'
}

export type PersonContextPack = {
  formatVersion: 'phase8c1'
  exportedAt: string | null
  mode: ContextPackExportMode
  scope: { kind: 'person'; canonicalPersonId: string }
  title: string
  identity: {
    primaryDisplayName: string
    aliases: string[]
    manualLabels: string[]
    firstSeenAt: string | null
    lastSeenAt: string | null
    evidenceCount: number
  }
  sections: ContextPackSection[]
  timelineHighlights: ContextPackTimelineEntry[]
  relationships: ContextPackRelationshipEntry[]
  ambiguity: ContextPackAmbiguitySummary[]
  sourceRefs: ContextPackSourceRef[]
  shareEnvelope: {
    requestShape: 'local_json_context_pack'
    policyKey: 'context_pack.local_export_baseline'
  }
}

export type GroupContextPack = {
  formatVersion: 'phase8c1'
  exportedAt: string | null
  mode: ContextPackExportMode
  scope: { kind: 'group'; anchorPersonId: string }
  title: string
  members: ContextPackGroupMember[]
  timelineWindows: ContextPackTimelineEntry[]
  sharedEvidenceSources: ContextPackSourceRef[]
  narrative: ContextPackNarrativeEntry[]
  ambiguity: ContextPackAmbiguitySummary[]
  sourceRefs: ContextPackSourceRef[]
  shareEnvelope: {
    requestShape: 'local_json_context_pack'
    policyKey: 'context_pack.local_export_baseline'
  }
}

export type ContextPackExportResult = {
  status: 'exported'
  filePath: string
  fileName: string
  sha256: string
  exportedAt: string
  mode: ContextPackExportMode
  scope: ContextPackScope
}

export type ReviewQueueItem = {
  id: string
  itemType: string
  candidateId: string
  status: string
  priority: number
  confidence: number
  summary: Record<string, unknown>
  createdAt: string
  reviewedAt: string | null
}

export type DecisionJournalEntry = {
  id: string
  decisionType: string
  decisionLabel?: string
  targetType: string
  targetId: string
  targetLabel?: string
  replaySummary?: string
  operationPayload: Record<string, unknown>
  undoPayload: Record<string, unknown>
  actor: string
  createdAt: string
  undoneAt: string | null
  undoneBy: string | null
}

export type DecisionJournalSearchResult = {
  journalId: string
  decisionType: string
  targetType: string
  decisionLabel: string
  targetLabel: string
  replaySummary: string
  actor: string
  createdAt: string
  undoneAt: string | null
}

export type SafeReviewGroupApprovalResult = {
  status: 'approved'
  batchId: string
  journalId: string
  groupKey: string
  itemCount: number
  canonicalPersonId: string | null
  canonicalPersonName: string | null
  itemType: 'profile_attribute_candidate'
  fieldKey: string | null
  queueItemIds: string[]
}

export type ReviewWorkbenchListItem = {
  queueItemId: string
  itemType: 'structured_field_candidate' | 'profile_attribute_candidate'
  candidateId: string
  status: string
  priority: number
  confidence: number
  summary: Record<string, unknown>
  canonicalPersonId: string | null
  canonicalPersonName: string | null
  fieldKey: string | null
  displayValue: string
  hasConflict: boolean
  createdAt: string
  reviewedAt: string | null
}

export type ReviewInboxPersonSummary = {
  canonicalPersonId: string | null
  canonicalPersonName: string
  pendingCount: number
  conflictCount: number
  fieldKeys: string[]
  itemTypes: Array<'structured_field_candidate' | 'profile_attribute_candidate'>
  nextQueueItemId: string
  latestPendingCreatedAt: string
  hasContinuousSequence: boolean
}

export type ReviewConflictGroupSummary = {
  groupKey: string
  canonicalPersonId: string | null
  canonicalPersonName: string
  itemType: 'structured_field_candidate' | 'profile_attribute_candidate'
  fieldKey: string | null
  pendingCount: number
  distinctValues: string[]
  hasConflict: boolean
  nextQueueItemId: string
  latestPendingCreatedAt: string
}

export type ReviewEvidenceTrace = {
  queueItem: ReviewQueueItem
  candidate: StructuredFieldCandidate | ProfileAttributeCandidate | null
  sourceFile: {
    fileId: string
    fileName: string
    batchId: string | null
    fileKind: string | null
  } | null
  sourceEvidence: {
    evidenceId: string
    evidenceType: string
    status: string
    riskLevel: string
    payloadJson: string
    fileId: string
    jobId: string | null
  } | null
  sourceCandidate: {
    candidateId: string
    candidateType: 'structured_field_candidate' | 'profile_attribute_candidate'
    status: string
  } | null
  sourceJournal: DecisionJournalEntry | null
}

export type ReviewImpactPreview = {
  approveImpact: {
    kind: string
    summary: string
    canonicalPersonId: string | null
    canonicalPersonName: string | null
    fieldKey: string | null
    nextValue: string | null
    currentValue: string | null
    sourceEvidenceId: string | null
    sourceCandidateId: string | null
    relatedJournalId: string | null
  }
  rejectImpact: {
    kind: string
    summary: string
    canonicalPersonId: string | null
    sourceEvidenceId: string | null
    sourceCandidateId: string | null
  }
  undoImpact: {
    kind: string
    summary: string
    canonicalPersonId: string | null
    affectedJournalId: string | null
    affectedAttributeIds: string[]
  }
}

export type ReviewWorkbenchDetail = {
  item: ReviewWorkbenchListItem
  queueItem: ReviewQueueItem
  candidate: StructuredFieldCandidate | ProfileAttributeCandidate | null
  trace: ReviewEvidenceTrace
  impactPreview: ReviewImpactPreview
  currentProfileAttributes: PersonProfileAttribute[]
}

export type BackupManifestEntry = {
  relativePath: string
  fileSize: number
  sha256: string
}

export type BackupManifest = {
  formatVersion: 'phase6a1'
  appVersion: string
  createdAt: string
  exportRootName: string
  databaseSnapshot: BackupManifestEntry
  vaultEntries: BackupManifestEntry[]
  tableCounts: Record<string, number>
  package?: {
    mode: 'directory'
  } | {
    mode: 'encrypted'
    encryptedArtifactRelativePath: string
    algorithm: 'aes-256-gcm'
    kdf: 'scrypt'
    saltBase64: string
    ivBase64: string
    authTagBase64: string
    payloadEncoding: 'gzip-json-v1'
  }
}

export type BackupExportResult = {
  status: 'exported'
  exportRoot: string
  manifestPath: string
  vaultEntryCount: number
  totalBytes: number
  packageMode: 'directory' | 'encrypted'
  encryptedArtifactPath: string | null
  manifest: BackupManifest
}

export type RestoreCheckResult = {
  name: string
  status: 'passed' | 'failed'
  detail: string
  expected?: Record<string, unknown>
  actual?: Record<string, unknown>
}

export type RestoreRunResult = {
  status: 'restored' | 'failed'
  mode: 'restore' | 'recovery_drill'
  exportRoot: string
  targetRoot: string
  restoredAt: string
  summary: {
    passedCount: number
    failedCount: number
  }
  checks: RestoreCheckResult[]
}

export type CreateImportBatchInput = {
  sourcePaths: string[]
  sourceLabel: string
}

export type ImportPreflightItem = {
  sourcePath: string
  fileName: string
  extension: string
  normalizedFileName: string
  importKindHint: 'chat' | 'image' | 'document' | 'unknown'
  isSupported: boolean
  status: 'supported' | 'unsupported' | 'duplicate_candidate'
}

export type ImportPreflightSummary = {
  totalCount: number
  supportedCount: number
  unsupportedCount: number
}

export type ImportPreflightResult = {
  items: ImportPreflightItem[]
  summary: ImportPreflightSummary
}

export type AgentRole =
  | 'ingestion'
  | 'review'
  | 'workspace'
  | 'governance'

export type AgentTaskKindByRole = {
  ingestion:
    | 'ingestion.import_batch'
    | 'ingestion.rerun_enrichment'
    | 'ingestion.summarize_document_evidence'
  review:
    | 'review.summarize_queue'
    | 'review.suggest_safe_group_action'
    | 'review.apply_safe_group'
    | 'review.apply_item_decision'
  workspace:
    | 'workspace.ask_memory'
    | 'workspace.compare'
    | 'workspace.publish_draft'
  governance:
    | 'governance.record_feedback'
    | 'governance.summarize_failures'
    | 'governance.propose_policy_update'
}

export type AgentTaskKind = AgentTaskKindByRole[AgentRole]

export type AgentMemoryRecord = {
  memoryId: string
  role: AgentRole
  memoryKey: string
  memoryValue: string
  createdAt: string
  updatedAt: string
}

export type AgentPolicyVersionRecord = {
  policyVersionId: string
  role: AgentRole
  policyKey: string
  policyBody: string
  createdAt: string
}

export type {
  AgentArtifactRef,
  AgentCheckpointKind,
  AgentCheckpointMetadata,
  AgentCheckpointRecord,
  AgentExecutionBudget,
  AgentMessageKind,
  AgentMessageRecordV2,
  AgentObjectiveDetail,
  AgentObjectiveInitiator,
  AgentObjectiveKind,
  AgentObjectiveRecord,
  AgentObjectiveRiskLevel,
  AgentObjectiveStatus,
  AgentParticipantKind,
  AgentProposalKind,
  AgentProposalAutonomyDecision,
  AgentProposalRecord,
  AgentProposalRiskLevel,
  AgentProposalStatus,
  AgentSkillPackId,
  AcknowledgeObjectiveRuntimeAlertInput,
  ListObjectiveRuntimeEventsInput,
  ListObjectiveRuntimeAlertsInput,
  ObjectiveRuntimeAlertRecord,
  ObjectiveRuntimeEventRecord,
  ObjectiveRuntimeScorecard,
  ObjectiveRuntimeSettingsRecord,
  ResolveObjectiveRuntimeAlertInput,
  AgentSubagentRecord,
  AgentSubagentStatus,
  AgentThreadDetail,
  AgentThreadKind,
  AgentThreadParticipantRecord,
  AgentThreadRecord,
  AgentThreadStatus,
  AgentToolExecutionRecord,
  AgentToolExecutionStatus,
  AgentVoteRecord,
  AgentVoteValue,
  ConfirmAgentProposalInput,
  CreateAgentObjectiveInput,
  CreateAgentProposalInput,
  GetAgentObjectiveInput,
  GetAgentThreadInput,
  ListAgentObjectivesInput,
  RespondToAgentProposalInput,
  UpdateObjectiveRuntimeSettingsInput,
} from './objectiveRuntimeContracts'

export type ListAgentMemoriesInput = {
  role?: AgentRole
  memoryKey?: string
}

export type ListAgentPolicyVersionsInput = {
  role?: AgentRole
  policyKey?: string
}

export interface ArchiveApi {
  selectImportFiles: () => Promise<string[]>
  selectBackupExportDestination: () => Promise<string | null>
  selectBackupExportSource: () => Promise<string | null>
  selectRestoreTargetDirectory: () => Promise<string | null>
  createBackupExport: (input: { destinationRoot: string; encryptionPassword?: string }) => Promise<BackupExportResult | null>
  restoreBackupExport: (input: { exportRoot: string; targetRoot: string; overwrite?: boolean; encryptionPassword?: string }) => Promise<RestoreRunResult | null>
  runRecoveryDrill: (input: { exportRoot: string; targetRoot: string; overwrite?: boolean; encryptionPassword?: string }) => Promise<RestoreRunResult | null>
  createImportBatch: (input: CreateImportBatchInput) => Promise<ImportBatchSummary>
  preflightImportBatch: (input: { sourcePaths: string[] }) => Promise<ImportPreflightResult>
  createAgentObjective: (input: CreateAgentObjectiveInput) => Promise<AgentObjectiveDetail>
  refreshObjectiveTriggers: () => Promise<AgentObjectiveDetail[]>
  listAgentObjectives: (input?: ListAgentObjectivesInput) => Promise<AgentObjectiveRecord[]>
  getAgentObjective: (input: GetAgentObjectiveInput) => Promise<AgentObjectiveDetail | null>
  getAgentThread: (input: GetAgentThreadInput) => Promise<AgentThreadDetail | null>
  respondToAgentProposal: (input: RespondToAgentProposalInput) => Promise<AgentProposalRecord | null>
  confirmAgentProposal: (input: ConfirmAgentProposalInput) => Promise<AgentProposalRecord | null>
  getObjectiveRuntimeScorecard: () => Promise<ObjectiveRuntimeScorecard>
  listObjectiveRuntimeEvents: (input?: ListObjectiveRuntimeEventsInput) => Promise<ObjectiveRuntimeEventRecord[]>
  listObjectiveRuntimeAlerts: (input?: ListObjectiveRuntimeAlertsInput) => Promise<ObjectiveRuntimeAlertRecord[]>
  acknowledgeObjectiveRuntimeAlert: (input: AcknowledgeObjectiveRuntimeAlertInput) => Promise<ObjectiveRuntimeAlertRecord | null>
  resolveObjectiveRuntimeAlert: (input: ResolveObjectiveRuntimeAlertInput) => Promise<ObjectiveRuntimeAlertRecord | null>
  getObjectiveRuntimeSettings: () => Promise<ObjectiveRuntimeSettingsRecord>
  updateObjectiveRuntimeSettings: (input: UpdateObjectiveRuntimeSettingsInput) => Promise<ObjectiveRuntimeSettingsRecord>
  listAgentMemories: (input?: ListAgentMemoriesInput) => Promise<AgentMemoryRecord[]>
  listAgentPolicyVersions: (input?: ListAgentPolicyVersionsInput) => Promise<AgentPolicyVersionRecord[]>
  listImportBatches: () => Promise<ImportBatchSummary[]>
  getImportBatch: (batchId: string) => Promise<ImportBatchSummary | null>
  searchArchive: (input: { query?: string; fileKinds?: string[]; batchId?: string; duplicateClass?: string; personName?: string }) => Promise<ArchiveSearchResult[]>
  logicalDeleteBatch: (batchId: string) => Promise<{ status: 'deleted'; batchId: string; deletedAt: string }>
  selectContextPackExportDestination: () => Promise<string | null>
  listCanonicalPeople: () => Promise<CanonicalPersonSummary[]>
  getCanonicalPerson: (canonicalPersonId: string) => Promise<CanonicalPersonDetail | null>
  getPersonDossier: (canonicalPersonId: string) => Promise<PersonDossier | null>
  getPersonContextPack: (input: { canonicalPersonId: string; mode?: ContextPackExportMode }) => Promise<PersonContextPack | null>
  askMemoryWorkspace: (input: AskMemoryWorkspaceInput) => Promise<MemoryWorkspaceResponse | null>
  listMemoryWorkspaceSessions: (input?: { scope?: MemoryWorkspaceScope }) => Promise<MemoryWorkspaceSessionSummary[]>
  getMemoryWorkspaceSession: (sessionId: string) => Promise<MemoryWorkspaceSessionDetail | null>
  askMemoryWorkspacePersisted: (input: AskMemoryWorkspacePersistedInput) => Promise<MemoryWorkspaceTurnRecord | null>
  runMemoryWorkspaceCompare: (input: RunMemoryWorkspaceCompareInput) => Promise<MemoryWorkspaceCompareSessionDetail | null>
  listMemoryWorkspaceCompareSessions: (input?: { scope?: MemoryWorkspaceScope }) => Promise<MemoryWorkspaceCompareSessionSummary[]>
  getMemoryWorkspaceCompareSession: (compareSessionId: string) => Promise<MemoryWorkspaceCompareSessionDetail | null>
  runMemoryWorkspaceCompareMatrix: (input: RunMemoryWorkspaceCompareMatrixInput) => Promise<MemoryWorkspaceCompareMatrixDetail | null>
  listMemoryWorkspaceCompareMatrices: () => Promise<MemoryWorkspaceCompareMatrixSummary[]>
  getMemoryWorkspaceCompareMatrix: (matrixSessionId: string) => Promise<MemoryWorkspaceCompareMatrixDetail | null>
  getPersonaDraftReviewByTurn: (turnId: string) => Promise<MemoryWorkspacePersonaDraftReviewRecord | null>
  createPersonaDraftReviewFromTurn: (turnId: string) => Promise<MemoryWorkspacePersonaDraftReviewRecord | null>
  updatePersonaDraftReview: (input: UpdatePersonaDraftReviewInput) => Promise<MemoryWorkspacePersonaDraftReviewRecord | null>
  transitionPersonaDraftReview: (input: TransitionPersonaDraftReviewInput) => Promise<MemoryWorkspacePersonaDraftReviewRecord | null>
  selectPersonaDraftHandoffDestination: () => Promise<string | null>
  listApprovedPersonaDraftHandoffs: (input: ListApprovedPersonaDraftHandoffsInput) => Promise<ApprovedPersonaDraftHandoffRecord[]>
  exportApprovedPersonaDraft: (input: ExportApprovedPersonaDraftInput) => Promise<ExportApprovedPersonaDraftResult | null>
  selectApprovedDraftPublicationDestination: () => Promise<string | null>
  listApprovedPersonaDraftPublications: (input: ListApprovedPersonaDraftPublicationsInput) => Promise<ApprovedPersonaDraftPublicationRecord[]>
  publishApprovedPersonaDraft: (input: PublishApprovedPersonaDraftInput) => Promise<PublishApprovedPersonaDraftResult | null>
  openApprovedDraftPublicationEntry: (input: OpenApprovedDraftPublicationEntryInput) => Promise<OpenApprovedDraftPublicationEntryResult>
  getApprovedDraftHostedShareHostStatus: () => Promise<ApprovedDraftHostedShareHostStatus>
  listApprovedPersonaDraftHostedShareLinks: (input: ListApprovedPersonaDraftHostedShareLinksInput) => Promise<ApprovedPersonaDraftHostedShareLinkRecord[]>
  createApprovedPersonaDraftHostedShareLink: (input: CreateApprovedPersonaDraftHostedShareLinkInput) => Promise<CreateApprovedPersonaDraftHostedShareLinkResult | null>
  revokeApprovedPersonaDraftHostedShareLink: (input: RevokeApprovedPersonaDraftHostedShareLinkInput) => Promise<RevokeApprovedPersonaDraftHostedShareLinkResult | null>
  openApprovedDraftHostedShareLink: (input: OpenApprovedDraftHostedShareLinkInput) => Promise<OpenApprovedDraftHostedShareLinkResult>
  listApprovedDraftSendDestinations: () => Promise<ApprovedDraftSendDestination[]>
  listApprovedPersonaDraftProviderSends: (input: ListApprovedPersonaDraftProviderSendsInput) => Promise<ApprovedPersonaDraftProviderSendArtifact[]>
  sendApprovedPersonaDraftToProvider: (input: SendApprovedPersonaDraftToProviderInput) => Promise<SendApprovedPersonaDraftToProviderResult | null>
  retryApprovedPersonaDraftProviderSend: (input: RetryApprovedPersonaDraftProviderSendInput) => Promise<SendApprovedPersonaDraftToProviderResult | null>
  listGroupPortraits: () => Promise<GroupPortraitBrowseSummary[]>
  getGroupPortrait: (canonicalPersonId: string) => Promise<GroupPortrait | null>
  getGroupContextPack: (input: { anchorPersonId: string; mode?: ContextPackExportMode }) => Promise<GroupContextPack | null>
  exportPersonContextPack: (input: { canonicalPersonId: string; destinationRoot: string; mode?: ContextPackExportMode }) => Promise<ContextPackExportResult | null>
  exportGroupContextPack: (input: { anchorPersonId: string; destinationRoot: string; mode?: ContextPackExportMode }) => Promise<ContextPackExportResult | null>
  getPersonTimeline: (canonicalPersonId: string) => Promise<PersonTimelineEvent[]>
  getPersonGraph: (canonicalPersonId: string) => Promise<PersonGraph>
  listPersonProfileAttributes: (input?: { canonicalPersonId?: string; status?: 'active' | 'superseded' | 'undone' }) => Promise<PersonProfileAttribute[]>
  listProfileAttributeCandidates: (input?: { canonicalPersonId?: string; status?: 'pending' | 'approved' | 'rejected' | 'undone' }) => Promise<ProfileAttributeCandidate[]>
  approveProfileAttributeCandidate: (queueItemId: string) => Promise<{ status: 'approved'; journalId: string; queueItemId: string; candidateId: string }>
  rejectProfileAttributeCandidate: (input: { queueItemId: string; note?: string }) => Promise<{ status: 'rejected'; journalId: string; queueItemId: string; candidateId: string }>
  undoProfileAttributeDecision: (journalId: string) => Promise<{ status: 'undone'; journalId: string }>
  listReviewQueue: (input?: { status?: string }) => Promise<ReviewQueueItem[]>
  listDecisionJournal: (input?: { query?: string; decisionType?: string; targetType?: string }) => Promise<DecisionJournalEntry[]>
  searchDecisionJournal: (input?: { query?: string; decisionType?: string; targetType?: string }) => Promise<DecisionJournalSearchResult[]>
  listReviewInboxPeople: () => Promise<ReviewInboxPersonSummary[]>
  listReviewConflictGroups: () => Promise<ReviewConflictGroupSummary[]>
  listReviewWorkbenchItems: (input?: { itemType?: 'structured_field_candidate' | 'profile_attribute_candidate'; status?: 'pending' | 'approved' | 'rejected' | 'undone'; canonicalPersonId?: string; fieldKey?: string; hasConflict?: boolean }) => Promise<ReviewWorkbenchListItem[]>
  getReviewWorkbenchItem: (queueItemId: string) => Promise<ReviewWorkbenchDetail | null>
  approveReviewItem: (queueItemId: string) => Promise<{ status: 'approved'; journalId: string; queueItemId: string; candidateId: string }>
  approveSafeReviewGroup: (input: { groupKey: string }) => Promise<SafeReviewGroupApprovalResult>
  rejectReviewItem: (input: { queueItemId: string; note?: string }) => Promise<{ status: 'rejected'; journalId: string; queueItemId: string; candidateId: string }>
  undoDecision: (journalId: string) => Promise<{ status: 'undone'; journalId: string }>
  setRelationshipLabel: (input: { fromPersonId: string; toPersonId: string; label: string }) => Promise<{ id: string; status: 'approved' }>
  listEnrichmentJobs: (input?: { status?: 'pending' | 'processing' | 'completed' | 'failed'; fileId?: string }) => Promise<EnrichmentJob[]>
  listEnrichmentAttempts: (input?: { jobId?: string; status?: 'processing' | 'completed' | 'failed' | 'cancelled' }) => Promise<EnrichmentAttempt[]>
  listProviderEgressArtifacts: (jobId: string) => Promise<ProviderEgressArtifact[]>
  getDocumentEvidence: (fileId: string) => Promise<DocumentEvidence | null>
  rerunEnrichmentJob: (jobId: string) => Promise<EnrichmentJob | null>
  listStructuredFieldCandidates: (input?: { fileId?: string; status?: 'pending' | 'approved' | 'rejected' | 'undone' }) => Promise<StructuredFieldCandidate[]>
  approveStructuredFieldCandidate: (queueItemId: string) => Promise<{ status: 'approved'; journalId: string; queueItemId: string; candidateId: string }>
  rejectStructuredFieldCandidate: (input: { queueItemId: string; note?: string }) => Promise<{ status: 'rejected'; journalId: string; queueItemId: string; candidateId: string }>
  undoStructuredFieldDecision: (journalId: string) => Promise<{ status: 'undone'; journalId: string }>
}

declare global {
  interface Window {
    archiveApi: ArchiveApi
  }
}
