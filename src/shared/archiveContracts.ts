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
}

declare global {
  interface Window {
    archiveApi: ArchiveApi
  }
}
