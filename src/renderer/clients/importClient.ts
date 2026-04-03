import type { ArchiveApi, ArchiveSearchResult, ImportBatchSummary, ImportPreflightResult } from '../../shared/archiveContracts'
import { bridgeMethod } from './clientHelpers'

type ImportClient = Pick<
  ArchiveApi,
  'selectImportFiles' | 'preflightImportBatch' | 'createImportBatch' | 'listImportBatches' | 'getImportBatch' | 'searchArchive' | 'logicalDeleteBatch'
>

export function getImportClient(): ImportClient {
  return {
    selectImportFiles: bridgeMethod('selectImportFiles', async () => []),
    preflightImportBatch: bridgeMethod(
      'preflightImportBatch',
      async (_input: { sourcePaths: string[] }) => ({ items: [], summary: { totalCount: 0, supportedCount: 0, unsupportedCount: 0 } }) as ImportPreflightResult
    ),
    createImportBatch: bridgeMethod(
      'createImportBatch',
      async (_input) => ({ batchId: '', sourceLabel: '', createdAt: '', files: [] })
    ),
    listImportBatches: bridgeMethod('listImportBatches', async () => [] as ImportBatchSummary[]),
    getImportBatch: bridgeMethod('getImportBatch', async () => null),
    searchArchive: bridgeMethod('searchArchive', async () => [] as ArchiveSearchResult[]),
    logicalDeleteBatch: bridgeMethod(
      'logicalDeleteBatch',
      async (batchId: string) => ({ status: 'deleted' as const, batchId, deletedAt: '' })
    )
  }
}
