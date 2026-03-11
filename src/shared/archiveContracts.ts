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
  targetType: string
  targetId: string
  operationPayload: Record<string, unknown>
  undoPayload: Record<string, unknown>
  actor: string
  createdAt: string
  undoneAt: string | null
  undoneBy: string | null
}

export type CreateImportBatchInput = {
  sourcePaths: string[]
  sourceLabel: string
}

export interface ArchiveApi {
  selectImportFiles: () => Promise<string[]>
  createImportBatch: (input: CreateImportBatchInput) => Promise<ImportBatchSummary>
  listImportBatches: () => Promise<ImportBatchSummary[]>
  getImportBatch: (batchId: string) => Promise<ImportBatchSummary | null>
  searchArchive: (input: { query?: string; fileKinds?: string[]; batchId?: string; duplicateClass?: string; personName?: string }) => Promise<ArchiveSearchResult[]>
  logicalDeleteBatch: (batchId: string) => Promise<{ status: 'deleted'; batchId: string; deletedAt: string }>
  listCanonicalPeople: () => Promise<CanonicalPersonSummary[]>
  getCanonicalPerson: (canonicalPersonId: string) => Promise<CanonicalPersonDetail | null>
  getPersonTimeline: (canonicalPersonId: string) => Promise<PersonTimelineEvent[]>
  getPersonGraph: (canonicalPersonId: string) => Promise<PersonGraph>
  listReviewQueue: (input?: { status?: string }) => Promise<ReviewQueueItem[]>
  listDecisionJournal: () => Promise<DecisionJournalEntry[]>
  approveReviewItem: (queueItemId: string) => Promise<{ status: 'approved'; journalId: string; queueItemId: string; candidateId: string }>
  rejectReviewItem: (input: { queueItemId: string; note?: string }) => Promise<{ status: 'rejected'; journalId: string; queueItemId: string; candidateId: string }>
  undoDecision: (journalId: string) => Promise<{ status: 'undone'; journalId: string }>
  setRelationshipLabel: (input: { fromPersonId: string; toPersonId: string; label: string }) => Promise<{ id: string; status: 'approved' }>
  listEnrichmentJobs: (input?: { status?: 'pending' | 'processing' | 'completed' | 'failed'; fileId?: string }) => Promise<EnrichmentJob[]>
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
