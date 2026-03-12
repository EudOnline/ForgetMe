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

export interface ArchiveApi {
  selectImportFiles: () => Promise<string[]>
  selectBackupExportDestination: () => Promise<string | null>
  selectBackupExportSource: () => Promise<string | null>
  selectRestoreTargetDirectory: () => Promise<string | null>
  createBackupExport: (input: { destinationRoot: string; encryptionPassword?: string }) => Promise<BackupExportResult | null>
  restoreBackupExport: (input: { exportRoot: string; targetRoot: string; overwrite?: boolean; encryptionPassword?: string }) => Promise<RestoreRunResult | null>
  runRecoveryDrill: (input: { exportRoot: string; targetRoot: string; overwrite?: boolean; encryptionPassword?: string }) => Promise<RestoreRunResult | null>
  createImportBatch: (input: CreateImportBatchInput) => Promise<ImportBatchSummary>
  listImportBatches: () => Promise<ImportBatchSummary[]>
  getImportBatch: (batchId: string) => Promise<ImportBatchSummary | null>
  searchArchive: (input: { query?: string; fileKinds?: string[]; batchId?: string; duplicateClass?: string; personName?: string }) => Promise<ArchiveSearchResult[]>
  logicalDeleteBatch: (batchId: string) => Promise<{ status: 'deleted'; batchId: string; deletedAt: string }>
  listCanonicalPeople: () => Promise<CanonicalPersonSummary[]>
  getCanonicalPerson: (canonicalPersonId: string) => Promise<CanonicalPersonDetail | null>
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
