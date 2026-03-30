import type {
  AgentExecutionPreview,
  AgentMemoryRecord,
  AgentObjectiveDetail,
  AgentObjectiveRecord,
  AgentPolicyVersionRecord,
  AgentProposalRecord,
  AgentRole,
  AgentSuggestionRecord,
  AgentTaskKind,
  AgentThreadDetail,
  AgentRunDetail,
  AgentRunRecord,
  ApprovedDraftSendDestination,
  ApprovedPersonaDraftHandoffRecord,
  ApprovedPersonaDraftHostedShareLinkRecord,
  ApprovedPersonaDraftProviderSendArtifact,
  ArchiveApi,
  ArchiveSearchResult,
  BackupExportResult,
  CanonicalPersonDetail,
  ContextPackExportResult,
  DocumentEvidence,
  EnrichmentAttempt,
  EnrichmentJob,
  ExportApprovedPersonaDraftResult,
  GroupContextPack,
  ImportBatchSummary,
  ImportPreflightResult,
  PersonDossier,
  PersonContextPack,
  CanonicalPersonSummary,
  CreateApprovedPersonaDraftHostedShareLinkInput,
  CreateApprovedPersonaDraftHostedShareLinkResult,
  CreateImportBatchInput,
  DecisionJournalSearchResult,
  DecisionJournalEntry,
  GetAgentRunInput,
  GetAgentRuntimeSettingsInput,
  ListApprovedPersonaDraftHostedShareLinksInput,
  ListAgentMemoriesInput,
  ListAgentSuggestionsInput,
  ListAgentPolicyVersionsInput,
  ListAgentRunsInput,
  ApprovedDraftHostedShareHostStatus,
  DismissAgentSuggestionInput,
  OpenApprovedDraftHostedShareLinkInput,
  OpenApprovedDraftHostedShareLinkResult,
  RevokeApprovedPersonaDraftHostedShareLinkInput,
  RevokeApprovedPersonaDraftHostedShareLinkResult,
  PersonGraph,
  PersonProfileAttribute,
  PersonTimelineEvent,
  ProfileAttributeCandidate,
  ProviderEgressArtifact,
  RestoreRunResult,
  RunAgentTaskInput,
  RunAgentTaskResult,
  RunAgentSuggestionInput,
  AgentRuntimeSettingsRecord,
  ConfirmAgentProposalInput,
  CreateAgentObjectiveInput,
  ReviewConflictGroupSummary,
  ReviewInboxPersonSummary,
  ReviewQueueItem,
  ReviewWorkbenchDetail,
  ReviewWorkbenchListItem,
  GetAgentObjectiveInput,
  GetAgentThreadInput,
  ListAgentObjectivesInput,
  RespondToAgentProposalInput,
  StructuredFieldCandidate,
  UpdateAgentRuntimeSettingsInput
} from '../shared/archiveContracts'

declare global {
  interface Window {
    require?: (moduleName: string) => any
  }
}

const destructiveTaskKinds = new Set<AgentTaskKind>([
  'review.apply_safe_group',
  'review.apply_item_decision'
])

function fallbackTaskKindForInput(input: RunAgentTaskInput): AgentTaskKind {
  if (input.taskKind) {
    return input.taskKind
  }

  switch (input.role) {
    case 'orchestrator':
      return 'workspace.ask_memory'
    case 'ingestion':
      return 'ingestion.import_batch'
    case 'review':
      return 'review.summarize_queue'
    case 'workspace':
      return 'workspace.ask_memory'
    case 'governance':
      return 'governance.summarize_failures'
  }
}

function roleForTaskKind(taskKind: AgentTaskKind): AgentRole {
  if (taskKind.startsWith('ingestion.')) {
    return 'ingestion'
  }

  if (taskKind.startsWith('review.')) {
    return 'review'
  }

  if (taskKind.startsWith('workspace.')) {
    return 'workspace'
  }

  if (taskKind.startsWith('governance.')) {
    return 'governance'
  }

  return 'orchestrator'
}

function buildFallbackExecutionPreview(input: RunAgentTaskInput): AgentExecutionPreview {
  const taskKind = fallbackTaskKindForInput(input)
  const targetRole = input.role === 'orchestrator' ? roleForTaskKind(taskKind) : input.role

  return {
    taskKind,
    targetRole,
    assignedRoles: input.role === 'orchestrator' && targetRole !== 'orchestrator'
      ? ['orchestrator', targetRole]
      : [targetRole],
    requiresConfirmation: destructiveTaskKinds.has(taskKind)
  }
}

function fallbackOwnerRoleForObjective(input: CreateAgentObjectiveInput): AgentRole {
  if (input.ownerRole) {
    return input.ownerRole
  }

  switch (input.objectiveKind) {
    case 'review_decision':
      return 'review'
    case 'policy_change':
      return 'governance'
    case 'user_response':
    case 'publication':
    case 'evidence_investigation':
    default:
      return 'workspace'
  }
}

function buildFallbackObjectiveDetail(input: CreateAgentObjectiveInput): AgentObjectiveDetail {
  const ownerRole = fallbackOwnerRoleForObjective(input)

  return {
    objectiveId: '',
    title: input.title,
    objectiveKind: input.objectiveKind,
    status: 'in_progress',
    prompt: input.prompt,
    initiatedBy: input.initiatedBy ?? 'operator',
    ownerRole,
    mainThreadId: '',
    riskLevel: input.riskLevel ?? 'medium',
    budget: input.budget ?? null,
    requiresOperatorInput: false,
    createdAt: '',
    updatedAt: '',
    threads: [],
    participants: [],
    proposals: [],
    checkpoints: [],
    subagents: []
  }
}

const fallbackApi: ArchiveApi = {
  selectImportFiles: async () => [],
  selectContextPackExportDestination: async () => null,
  selectBackupExportDestination: async () => null,
  selectBackupExportSource: async () => null,
  selectRestoreTargetDirectory: async () => null,
  createBackupExport: async (_input: { destinationRoot: string; encryptionPassword?: string }) => null as BackupExportResult | null,
  restoreBackupExport: async (_input: { exportRoot: string; targetRoot: string; overwrite?: boolean; encryptionPassword?: string }) => null as RestoreRunResult | null,
  runRecoveryDrill: async (_input: { exportRoot: string; targetRoot: string; overwrite?: boolean; encryptionPassword?: string }) => null as RestoreRunResult | null,
  preflightImportBatch: async (_input: { sourcePaths: string[] }) => ({ items: [], summary: { totalCount: 0, supportedCount: 0, unsupportedCount: 0 } }) as ImportPreflightResult,
  createImportBatch: async (_input: CreateImportBatchInput) => ({ batchId: '', sourceLabel: '', createdAt: '', files: [] }),
  previewAgentTask: async (input: RunAgentTaskInput) => buildFallbackExecutionPreview(input),
  runAgentTask: async (_input: RunAgentTaskInput) => ({
    runId: '',
    status: 'queued' as const,
    targetRole: null,
    assignedRoles: [],
    latestAssistantResponse: null
  }) as RunAgentTaskResult,
  createAgentObjective: async (input: CreateAgentObjectiveInput) => buildFallbackObjectiveDetail(input),
  listAgentObjectives: async (_input?: ListAgentObjectivesInput) => [] as AgentObjectiveRecord[],
  getAgentObjective: async (_input: GetAgentObjectiveInput) => null as AgentObjectiveDetail | null,
  getAgentThread: async (_input: GetAgentThreadInput) => null as AgentThreadDetail | null,
  respondToAgentProposal: async (_input: RespondToAgentProposalInput) => null as AgentProposalRecord | null,
  confirmAgentProposal: async (_input: ConfirmAgentProposalInput) => null as AgentProposalRecord | null,
  listAgentRuns: async (_input?: ListAgentRunsInput) => [] as AgentRunRecord[],
  getAgentRun: async (_input: GetAgentRunInput) => null as AgentRunDetail | null,
  listAgentMemories: async (_input?: ListAgentMemoriesInput) => [] as AgentMemoryRecord[],
  listAgentPolicyVersions: async (_input?: ListAgentPolicyVersionsInput) => [] as AgentPolicyVersionRecord[],
  listAgentSuggestions: async (_input?: ListAgentSuggestionsInput) => [] as AgentSuggestionRecord[],
  refreshAgentSuggestions: async () => [] as AgentSuggestionRecord[],
  dismissAgentSuggestion: async (_input: DismissAgentSuggestionInput) => null as AgentSuggestionRecord | null,
  runAgentSuggestion: async (_input: RunAgentSuggestionInput) => null as RunAgentTaskResult | null,
  getAgentRuntimeSettings: async (_input?: GetAgentRuntimeSettingsInput) => ({
    settingsId: 'default',
    autonomyMode: 'manual_only',
    updatedAt: ''
  }) as AgentRuntimeSettingsRecord,
  updateAgentRuntimeSettings: async (input: UpdateAgentRuntimeSettingsInput) => ({
    settingsId: 'default',
    autonomyMode: input.autonomyMode,
    updatedAt: ''
  }) as AgentRuntimeSettingsRecord,
  listImportBatches: async () => [] as ImportBatchSummary[],
  getImportBatch: async () => null,
  searchArchive: async () => [] as ArchiveSearchResult[],
  logicalDeleteBatch: async (batchId: string) => ({ status: 'deleted' as const, batchId, deletedAt: '' }),
  listCanonicalPeople: async () => [] as CanonicalPersonSummary[],
  getCanonicalPerson: async (_canonicalPersonId: string) => null as CanonicalPersonDetail | null,
  getPersonDossier: async (_canonicalPersonId: string) => null as PersonDossier | null,
  getPersonContextPack: async (_input: { canonicalPersonId: string }) => null as PersonContextPack | null,
  askMemoryWorkspace: async () => null,
  listMemoryWorkspaceSessions: async () => [],
  getMemoryWorkspaceSession: async () => null,
  askMemoryWorkspacePersisted: async () => null,
  runMemoryWorkspaceCompare: async () => null,
  listMemoryWorkspaceCompareSessions: async () => [],
  getMemoryWorkspaceCompareSession: async () => null,
  runMemoryWorkspaceCompareMatrix: async () => null,
  listMemoryWorkspaceCompareMatrices: async () => [],
  getMemoryWorkspaceCompareMatrix: async () => null,
  getPersonaDraftReviewByTurn: async () => null,
  createPersonaDraftReviewFromTurn: async () => null,
  updatePersonaDraftReview: async () => null,
  transitionPersonaDraftReview: async () => null,
  selectPersonaDraftHandoffDestination: async () => null,
  listApprovedPersonaDraftHandoffs: async () => [] as ApprovedPersonaDraftHandoffRecord[],
  exportApprovedPersonaDraft: async (_input: { draftReviewId: string; destinationRoot: string }) => null as ExportApprovedPersonaDraftResult | null,
  selectApprovedDraftPublicationDestination: async () => null,
  listApprovedPersonaDraftPublications: async () => [],
  publishApprovedPersonaDraft: async (_input: { draftReviewId: string; destinationRoot: string }) => null,
  openApprovedDraftPublicationEntry: async (input: { entryPath: string }) => ({
    status: 'failed' as const,
    entryPath: input.entryPath,
    errorMessage: 'archive api unavailable'
  }),
  getApprovedDraftHostedShareHostStatus: async () => ({
    availability: 'unconfigured' as const,
    hostKind: null,
    hostLabel: null
  }),
  listApprovedPersonaDraftHostedShareLinks: async (_input: ListApprovedPersonaDraftHostedShareLinksInput) => [] as ApprovedPersonaDraftHostedShareLinkRecord[],
  createApprovedPersonaDraftHostedShareLink: async (_input: CreateApprovedPersonaDraftHostedShareLinkInput) => null as CreateApprovedPersonaDraftHostedShareLinkResult | null,
  revokeApprovedPersonaDraftHostedShareLink: async (_input: RevokeApprovedPersonaDraftHostedShareLinkInput) => null as RevokeApprovedPersonaDraftHostedShareLinkResult | null,
  openApprovedDraftHostedShareLink: async (input: OpenApprovedDraftHostedShareLinkInput) => ({
    status: 'failed' as const,
    shareUrl: input.shareUrl,
    errorMessage: 'archive api unavailable'
  }),
  listApprovedDraftSendDestinations: async () => [] as ApprovedDraftSendDestination[],
  listApprovedPersonaDraftProviderSends: async () => [] as ApprovedPersonaDraftProviderSendArtifact[],
  sendApprovedPersonaDraftToProvider: async (_input: { draftReviewId: string; destinationId?: string }) => null,
  retryApprovedPersonaDraftProviderSend: async (_input: { artifactId: string }) => null,
  listGroupPortraits: async () => [],
  getGroupPortrait: async (_canonicalPersonId: string) => null,
  getGroupContextPack: async (_input: { anchorPersonId: string }) => null as GroupContextPack | null,
  exportPersonContextPack: async (_input: { canonicalPersonId: string; destinationRoot: string }) => null as ContextPackExportResult | null,
  exportGroupContextPack: async (_input: { anchorPersonId: string; destinationRoot: string }) => null as ContextPackExportResult | null,
  getPersonTimeline: async (_canonicalPersonId: string) => [] as PersonTimelineEvent[],
  getPersonGraph: async (_canonicalPersonId: string) => ({ nodes: [], edges: [] } as PersonGraph),
  listPersonProfileAttributes: async () => [] as PersonProfileAttribute[],
  listProfileAttributeCandidates: async () => [] as ProfileAttributeCandidate[],
  approveProfileAttributeCandidate: async (queueItemId: string) => ({ status: 'approved' as const, journalId: '', queueItemId, candidateId: '' }),
  rejectProfileAttributeCandidate: async ({ queueItemId }: { queueItemId: string; note?: string }) => ({ status: 'rejected' as const, journalId: '', queueItemId, candidateId: '' }),
  undoProfileAttributeDecision: async (journalId: string) => ({ status: 'undone' as const, journalId }),
  listReviewQueue: async () => [] as ReviewQueueItem[],
  listDecisionJournal: async () => [] as DecisionJournalEntry[],
  searchDecisionJournal: async () => [] as DecisionJournalSearchResult[],
  listReviewInboxPeople: async () => [] as ReviewInboxPersonSummary[],
  listReviewConflictGroups: async () => [] as ReviewConflictGroupSummary[],
  listReviewWorkbenchItems: async () => [] as ReviewWorkbenchListItem[],
  getReviewWorkbenchItem: async () => null as ReviewWorkbenchDetail | null,
  approveReviewItem: async (queueItemId: string) => ({ status: 'approved' as const, journalId: '', queueItemId, candidateId: '' }),
  approveSafeReviewGroup: async ({ groupKey }: { groupKey: string }) => ({ status: 'approved' as const, batchId: '', journalId: '', groupKey, itemCount: 0, canonicalPersonId: null, canonicalPersonName: null, itemType: 'profile_attribute_candidate' as const, fieldKey: null, queueItemIds: [] }),
  rejectReviewItem: async ({ queueItemId }: { queueItemId: string; note?: string }) => ({ status: 'rejected' as const, journalId: '', queueItemId, candidateId: '' }),
  undoDecision: async (journalId: string) => ({ status: 'undone' as const, journalId }),
  setRelationshipLabel: async () => ({ id: '', status: 'approved' as const }),
  listEnrichmentJobs: async () => [] as EnrichmentJob[],
  listEnrichmentAttempts: async () => [] as EnrichmentAttempt[],
  listProviderEgressArtifacts: async (_jobId: string) => [] as ProviderEgressArtifact[],
  getDocumentEvidence: async (_fileId: string) => null as DocumentEvidence | null,
  rerunEnrichmentJob: async (_jobId: string) => null as EnrichmentJob | null,
  listStructuredFieldCandidates: async () => [] as StructuredFieldCandidate[],
  approveStructuredFieldCandidate: async (queueItemId: string) => ({ status: 'approved' as const, journalId: '', queueItemId, candidateId: '' }),
  rejectStructuredFieldCandidate: async ({ queueItemId }: { queueItemId: string; note?: string }) => ({ status: 'rejected' as const, journalId: '', queueItemId, candidateId: '' }),
  undoStructuredFieldDecision: async (journalId: string) => ({ status: 'undone' as const, journalId })
}

function createIpcArchiveApi(): ArchiveApi | null {
  const electron = window.require?.('electron')
  const ipcRenderer = electron?.ipcRenderer
  if (!ipcRenderer) {
    return null
  }

  return {
    selectImportFiles: () => ipcRenderer.invoke('archive:selectImportFiles'),
    selectContextPackExportDestination: () => ipcRenderer.invoke('archive:selectContextPackExportDestination'),
    selectBackupExportDestination: () => ipcRenderer.invoke('archive:selectBackupExportDestination'),
    selectBackupExportSource: () => ipcRenderer.invoke('archive:selectBackupExportSource'),
    selectRestoreTargetDirectory: () => ipcRenderer.invoke('archive:selectRestoreTargetDirectory'),
    createBackupExport: (input) => ipcRenderer.invoke('archive:createBackupExport', input),
    restoreBackupExport: (input) => ipcRenderer.invoke('archive:restoreBackupExport', input),
    runRecoveryDrill: (input) => ipcRenderer.invoke('archive:runRecoveryDrill', input),
    preflightImportBatch: (input) => ipcRenderer.invoke('archive:preflightImportBatch', input),
    createImportBatch: (input) => ipcRenderer.invoke('archive:createImportBatch', input),
    previewAgentTask: (input) => ipcRenderer.invoke('archive:previewAgentTask', input),
    runAgentTask: (input) => ipcRenderer.invoke('archive:runAgentTask', input),
    createAgentObjective: (input) => ipcRenderer.invoke('archive:createAgentObjective', input),
    listAgentObjectives: (input) => ipcRenderer.invoke('archive:listAgentObjectives', input),
    getAgentObjective: (input) => ipcRenderer.invoke('archive:getAgentObjective', input),
    getAgentThread: (input) => ipcRenderer.invoke('archive:getAgentThread', input),
    respondToAgentProposal: (input) => ipcRenderer.invoke('archive:respondToAgentProposal', input),
    confirmAgentProposal: (input) => ipcRenderer.invoke('archive:confirmAgentProposal', input),
    listAgentRuns: (input) => ipcRenderer.invoke('archive:listAgentRuns', input),
    getAgentRun: (input) => ipcRenderer.invoke('archive:getAgentRun', input),
    listAgentMemories: (input) => ipcRenderer.invoke('archive:listAgentMemories', input),
    listAgentPolicyVersions: (input) => ipcRenderer.invoke('archive:listAgentPolicyVersions', input),
    listAgentSuggestions: (input) => ipcRenderer.invoke('archive:listAgentSuggestions', input),
    refreshAgentSuggestions: () => ipcRenderer.invoke('archive:refreshAgentSuggestions'),
    dismissAgentSuggestion: (input) => ipcRenderer.invoke('archive:dismissAgentSuggestion', input),
    runAgentSuggestion: (input) => ipcRenderer.invoke('archive:runAgentSuggestion', input),
    getAgentRuntimeSettings: (input) => ipcRenderer.invoke('archive:getAgentRuntimeSettings', input),
    updateAgentRuntimeSettings: (input) => ipcRenderer.invoke('archive:updateAgentRuntimeSettings', input),
    listImportBatches: () => ipcRenderer.invoke('archive:listImportBatches'),
    getImportBatch: (batchId) => ipcRenderer.invoke('archive:getImportBatch', { batchId }),
    searchArchive: (input) => ipcRenderer.invoke('archive:search', input),
    logicalDeleteBatch: (batchId) => ipcRenderer.invoke('archive:deleteBatch', { batchId }),
    listCanonicalPeople: () => ipcRenderer.invoke('archive:listCanonicalPeople'),
    getCanonicalPerson: (canonicalPersonId) => ipcRenderer.invoke('archive:getCanonicalPerson', { canonicalPersonId }),
    getPersonDossier: (canonicalPersonId) => ipcRenderer.invoke('archive:getPersonDossier', { canonicalPersonId }),
    getPersonContextPack: (input) => ipcRenderer.invoke('archive:getPersonContextPack', input),
    askMemoryWorkspace: (input) => ipcRenderer.invoke('archive:askMemoryWorkspace', input),
    listMemoryWorkspaceSessions: (input) => ipcRenderer.invoke('archive:listMemoryWorkspaceSessions', input),
    getMemoryWorkspaceSession: (sessionId) => ipcRenderer.invoke('archive:getMemoryWorkspaceSession', { sessionId }),
    askMemoryWorkspacePersisted: (input) => ipcRenderer.invoke('archive:askMemoryWorkspacePersisted', input),
    runMemoryWorkspaceCompare: (input) => ipcRenderer.invoke('archive:runMemoryWorkspaceCompare', input),
    listMemoryWorkspaceCompareSessions: (input) => ipcRenderer.invoke('archive:listMemoryWorkspaceCompareSessions', input),
    getMemoryWorkspaceCompareSession: (compareSessionId) => ipcRenderer.invoke('archive:getMemoryWorkspaceCompareSession', { compareSessionId }),
    runMemoryWorkspaceCompareMatrix: (input) => ipcRenderer.invoke('archive:runMemoryWorkspaceCompareMatrix', input),
    listMemoryWorkspaceCompareMatrices: () => ipcRenderer.invoke('archive:listMemoryWorkspaceCompareMatrices'),
    getMemoryWorkspaceCompareMatrix: (matrixSessionId) => ipcRenderer.invoke('archive:getMemoryWorkspaceCompareMatrix', { matrixSessionId }),
    getPersonaDraftReviewByTurn: (turnId) => ipcRenderer.invoke('archive:getPersonaDraftReviewByTurn', { turnId }),
    createPersonaDraftReviewFromTurn: (turnId) => ipcRenderer.invoke('archive:createPersonaDraftReviewFromTurn', { turnId }),
    updatePersonaDraftReview: (input) => ipcRenderer.invoke('archive:updatePersonaDraftReview', input),
    transitionPersonaDraftReview: (input) => ipcRenderer.invoke('archive:transitionPersonaDraftReview', input),
    selectPersonaDraftHandoffDestination: () => ipcRenderer.invoke('archive:selectPersonaDraftHandoffDestination'),
    listApprovedPersonaDraftHandoffs: (input) => ipcRenderer.invoke('archive:listApprovedPersonaDraftHandoffs', input),
    exportApprovedPersonaDraft: (input) => ipcRenderer.invoke('archive:exportApprovedPersonaDraft', input),
    selectApprovedDraftPublicationDestination: () => ipcRenderer.invoke('archive:selectApprovedDraftPublicationDestination'),
    listApprovedPersonaDraftPublications: (input) => ipcRenderer.invoke('archive:listApprovedPersonaDraftPublications', input),
    publishApprovedPersonaDraft: (input) => ipcRenderer.invoke('archive:publishApprovedPersonaDraft', input),
    openApprovedDraftPublicationEntry: (input) => ipcRenderer.invoke('archive:openApprovedDraftPublicationEntry', input),
    getApprovedDraftHostedShareHostStatus: () => ipcRenderer.invoke('archive:getApprovedDraftHostedShareHostStatus'),
    listApprovedPersonaDraftHostedShareLinks: (input) => ipcRenderer.invoke('archive:listApprovedPersonaDraftHostedShareLinks', input),
    createApprovedPersonaDraftHostedShareLink: (input) => ipcRenderer.invoke('archive:createApprovedPersonaDraftHostedShareLink', input),
    revokeApprovedPersonaDraftHostedShareLink: (input) => ipcRenderer.invoke('archive:revokeApprovedPersonaDraftHostedShareLink', input),
    openApprovedDraftHostedShareLink: (input) => ipcRenderer.invoke('archive:openApprovedDraftHostedShareLink', input),
    listApprovedDraftSendDestinations: () => ipcRenderer.invoke('archive:listApprovedDraftSendDestinations'),
    listApprovedPersonaDraftProviderSends: (input) => ipcRenderer.invoke('archive:listApprovedPersonaDraftProviderSends', input),
    sendApprovedPersonaDraftToProvider: (input) => ipcRenderer.invoke('archive:sendApprovedPersonaDraftToProvider', input),
    retryApprovedPersonaDraftProviderSend: (input) => ipcRenderer.invoke('archive:retryApprovedPersonaDraftProviderSend', input),
    listGroupPortraits: () => ipcRenderer.invoke('archive:listGroupPortraits'),
    getGroupPortrait: (canonicalPersonId) => ipcRenderer.invoke('archive:getGroupPortrait', { canonicalPersonId }),
    getGroupContextPack: (input) => ipcRenderer.invoke('archive:getGroupContextPack', input),
    exportPersonContextPack: (input) => ipcRenderer.invoke('archive:exportPersonContextPack', input),
    exportGroupContextPack: (input) => ipcRenderer.invoke('archive:exportGroupContextPack', input),
    getPersonTimeline: (canonicalPersonId) => ipcRenderer.invoke('archive:getPersonTimeline', { canonicalPersonId }),
    getPersonGraph: (canonicalPersonId) => ipcRenderer.invoke('archive:getPersonGraph', { canonicalPersonId }),
    listPersonProfileAttributes: (input) => ipcRenderer.invoke('archive:listPersonProfileAttributes', input),
    listProfileAttributeCandidates: (input) => ipcRenderer.invoke('archive:listProfileAttributeCandidates', input),
    approveProfileAttributeCandidate: (queueItemId) => ipcRenderer.invoke('archive:approveProfileAttributeCandidate', { queueItemId }),
    rejectProfileAttributeCandidate: (input) => ipcRenderer.invoke('archive:rejectProfileAttributeCandidate', input),
    undoProfileAttributeDecision: (journalId) => ipcRenderer.invoke('archive:undoProfileAttributeDecision', { journalId }),
    listReviewQueue: (input) => ipcRenderer.invoke('archive:listReviewQueue', input),
    listDecisionJournal: (input) => ipcRenderer.invoke('archive:listDecisionJournal', input),
    searchDecisionJournal: (input) => ipcRenderer.invoke('archive:searchDecisionJournal', input),
    listReviewInboxPeople: () => ipcRenderer.invoke('archive:listReviewInboxPeople'),
    listReviewConflictGroups: () => ipcRenderer.invoke('archive:listReviewConflictGroups'),
    listReviewWorkbenchItems: (input) => ipcRenderer.invoke('archive:listReviewWorkbenchItems', input),
    getReviewWorkbenchItem: (queueItemId) => ipcRenderer.invoke('archive:getReviewWorkbenchItem', { queueItemId }),
    approveReviewItem: (queueItemId) => ipcRenderer.invoke('archive:approveReviewItem', { queueItemId }),
    approveSafeReviewGroup: (input) => ipcRenderer.invoke('archive:approveSafeReviewGroup', input),
    rejectReviewItem: (input) => ipcRenderer.invoke('archive:rejectReviewItem', input),
    undoDecision: (journalId) => ipcRenderer.invoke('archive:undoDecision', { journalId }),
    setRelationshipLabel: (input) => ipcRenderer.invoke('archive:setRelationshipLabel', input),
    listEnrichmentJobs: (input) => ipcRenderer.invoke('archive:listEnrichmentJobs', input),
    listEnrichmentAttempts: (input) => ipcRenderer.invoke('archive:listEnrichmentAttempts', input),
    listProviderEgressArtifacts: (jobId) => ipcRenderer.invoke('archive:listProviderEgressArtifacts', { jobId }),
    getDocumentEvidence: (fileId) => ipcRenderer.invoke('archive:getDocumentEvidence', { fileId }),
    rerunEnrichmentJob: (jobId) => ipcRenderer.invoke('archive:rerunEnrichmentJob', { jobId }),
    listStructuredFieldCandidates: (input) => ipcRenderer.invoke('archive:listStructuredFieldCandidates', input),
    approveStructuredFieldCandidate: (queueItemId) => ipcRenderer.invoke('archive:approveStructuredFieldCandidate', { queueItemId }),
    rejectStructuredFieldCandidate: (input) => ipcRenderer.invoke('archive:rejectStructuredFieldCandidate', input),
    undoStructuredFieldDecision: (journalId) => ipcRenderer.invoke('archive:undoStructuredFieldDecision', { journalId })
  }
}

export function getArchiveApi(): ArchiveApi {
  return window.archiveApi ?? createIpcArchiveApi() ?? fallbackApi
}
