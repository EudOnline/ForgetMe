import type { ArchiveApi } from '../../shared/archiveContracts'
import type { IpcRenderer } from 'electron'
import { invokeWith, invokeWithout } from './helpers'

type ReviewPreloadModule = Pick<
  ArchiveApi,
  | 'listReviewQueue'
  | 'listDecisionJournal'
  | 'searchDecisionJournal'
  | 'listReviewInboxPeople'
  | 'listReviewConflictGroups'
  | 'listReviewWorkbenchItems'
  | 'getReviewWorkbenchItem'
  | 'approveReviewItem'
  | 'approveSafeReviewGroup'
  | 'rejectReviewItem'
  | 'undoDecision'
>

export function createReviewPreloadModule(ipcRenderer: IpcRenderer): ReviewPreloadModule {
  return {
    listReviewQueue: invokeWith(ipcRenderer, 'archive:listReviewQueue'),
    listDecisionJournal: invokeWith(ipcRenderer, 'archive:listDecisionJournal'),
    searchDecisionJournal: invokeWith(ipcRenderer, 'archive:searchDecisionJournal'),
    listReviewInboxPeople: invokeWithout(ipcRenderer, 'archive:listReviewInboxPeople'),
    listReviewConflictGroups: invokeWithout(ipcRenderer, 'archive:listReviewConflictGroups'),
    listReviewWorkbenchItems: invokeWith(ipcRenderer, 'archive:listReviewWorkbenchItems'),
    getReviewWorkbenchItem: (queueItemId) => ipcRenderer.invoke('archive:getReviewWorkbenchItem', { queueItemId }),
    approveReviewItem: (queueItemId) => ipcRenderer.invoke('archive:approveReviewItem', { queueItemId }),
    approveSafeReviewGroup: invokeWith(ipcRenderer, 'archive:approveSafeReviewGroup'),
    rejectReviewItem: invokeWith(ipcRenderer, 'archive:rejectReviewItem'),
    undoDecision: (journalId) => ipcRenderer.invoke('archive:undoDecision', { journalId })
  }
}
