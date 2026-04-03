import type {
  ArchiveApi,
  DecisionJournalEntry,
  DecisionJournalSearchResult,
  ReviewConflictGroupSummary,
  ReviewInboxPersonSummary,
  ReviewQueueItem,
  ReviewWorkbenchDetail,
  ReviewWorkbenchListItem
} from '../../shared/archiveContracts'
import { bridgeMethod } from './clientHelpers'

type ReviewClient = Pick<
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

export function getReviewClient(): ReviewClient {
  return {
    listReviewQueue: bridgeMethod('listReviewQueue', async () => [] as ReviewQueueItem[]),
    listDecisionJournal: bridgeMethod('listDecisionJournal', async () => [] as DecisionJournalEntry[]),
    searchDecisionJournal: bridgeMethod('searchDecisionJournal', async () => [] as DecisionJournalSearchResult[]),
    listReviewInboxPeople: bridgeMethod('listReviewInboxPeople', async () => [] as ReviewInboxPersonSummary[]),
    listReviewConflictGroups: bridgeMethod('listReviewConflictGroups', async () => [] as ReviewConflictGroupSummary[]),
    listReviewWorkbenchItems: bridgeMethod('listReviewWorkbenchItems', async () => [] as ReviewWorkbenchListItem[]),
    getReviewWorkbenchItem: bridgeMethod('getReviewWorkbenchItem', async () => null as ReviewWorkbenchDetail | null),
    approveReviewItem: bridgeMethod(
      'approveReviewItem',
      async (queueItemId: string) => ({ status: 'approved' as const, journalId: '', queueItemId, candidateId: '' })
    ),
    approveSafeReviewGroup: bridgeMethod(
      'approveSafeReviewGroup',
      async ({ groupKey }: { groupKey: string }) => ({
        status: 'approved' as const,
        batchId: '',
        journalId: '',
        groupKey,
        itemCount: 0,
        canonicalPersonId: null,
        canonicalPersonName: null,
        itemType: 'profile_attribute_candidate' as const,
        fieldKey: null,
        queueItemIds: []
      })
    ),
    rejectReviewItem: bridgeMethod(
      'rejectReviewItem',
      async ({ queueItemId }: { queueItemId: string; note?: string }) => ({ status: 'rejected' as const, journalId: '', queueItemId, candidateId: '' })
    ),
    undoDecision: bridgeMethod('undoDecision', async (journalId: string) => ({ status: 'undone' as const, journalId }))
  }
}
