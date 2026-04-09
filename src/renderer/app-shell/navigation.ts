import type { MemoryWorkspaceCitation, MemoryWorkspaceScope } from '../../shared/archiveContracts'
import type { AppRoute } from './routeState'

export type AppShellAction = {
  type: 'route/navigate'
  route: AppRoute
}

function navigate(route: AppRoute): AppShellAction {
  return {
    type: 'route/navigate',
    route
  }
}

export function openImport() {
  return navigate({ kind: 'import' })
}

export function openBatches() {
  return navigate({ kind: 'batches' })
}

export function openBatchDetail(batchId: string) {
  return navigate({ kind: 'batch-detail', batchId })
}

export function openSearch() {
  return navigate({ kind: 'search' })
}

export function openPeople() {
  return navigate({ kind: 'people' })
}

export function openPersonDetail(canonicalPersonId: string) {
  return navigate({ kind: 'person-detail', canonicalPersonId })
}

export function openGroupPortrait(canonicalPersonId: string | null) {
  return navigate({ kind: 'group-portrait', canonicalPersonId })
}

export function openMemoryWorkspace(scope: MemoryWorkspaceScope) {
  return navigate({ kind: 'memory-workspace', scope })
}

export function openReviewQueue(options?: {
  initialJournalQuery?: string | null
  initialSelectedJournalId?: string | null
}) {
  return navigate({
    kind: 'review-queue',
    initialJournalQuery: options?.initialJournalQuery ?? null,
    initialSelectedJournalId: options?.initialSelectedJournalId ?? null
  })
}

export function openReviewWorkbench(initialQueueItemId?: string | null) {
  return navigate({
    kind: 'review-workbench',
    initialQueueItemId: initialQueueItemId ?? null
  })
}

export function openEnrichment() {
  return navigate({ kind: 'enrichment' })
}

export function openDocumentEvidence(fileId: string | null) {
  return navigate({ kind: 'document-evidence', fileId })
}

export function openPreservation() {
  return navigate({ kind: 'preservation' })
}

export function openReviewQueueFromCitation(citation: MemoryWorkspaceCitation) {
  return openReviewQueue({
    initialJournalQuery: citation.targetId,
    initialSelectedJournalId: citation.kind === 'journal' ? citation.targetId : null
  })
}
