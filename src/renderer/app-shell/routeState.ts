import type { MemoryWorkspaceScope } from '../../shared/archiveContracts'

export type AppRoute =
  | { kind: 'import' }
  | { kind: 'batches' }
  | { kind: 'batch-detail'; batchId: string }
  | { kind: 'search' }
  | { kind: 'people' }
  | { kind: 'person-detail'; canonicalPersonId: string }
  | { kind: 'group-portrait'; canonicalPersonId: string | null }
  | { kind: 'memory-workspace'; scope: MemoryWorkspaceScope }
  | { kind: 'review-queue'; initialJournalQuery?: string | null; initialSelectedJournalId?: string | null }
  | { kind: 'review-workbench'; initialQueueItemId?: string | null }
  | { kind: 'enrichment' }
  | { kind: 'document-evidence'; fileId: string | null }
  | { kind: 'preservation' }
  | { kind: 'objective-workbench' }

export type AppShellState = {
  route: AppRoute
}

export function pageLabelKeyForRoute(route: AppRoute) {
  switch (route.kind) {
    case 'import':
      return 'page.capture.import'
    case 'batches':
      return 'page.capture.batches'
    case 'batch-detail':
      return 'page.capture.batchDetail'
    case 'search':
      return 'page.explore.search'
    case 'people':
      return 'page.explore.people'
    case 'person-detail':
      return 'page.explore.person'
    case 'group-portrait':
      return 'page.explore.groupPortrait'
    case 'memory-workspace':
      return 'page.workspace.memory'
    case 'review-queue':
      return 'page.review.queue'
    case 'review-workbench':
      return 'page.review.workbench'
    case 'preservation':
      return 'page.ops.preservation'
    case 'enrichment':
      return 'page.ops.enrichmentJobs'
    case 'document-evidence':
      return 'page.evidence.document'
    case 'objective-workbench':
      return 'page.ops.objectiveWorkbench'
  }
}
