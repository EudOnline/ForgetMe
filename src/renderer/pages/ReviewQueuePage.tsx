import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DecisionJournalEntry, ReviewQueueItem } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { ReviewQueueTable } from '../components/ReviewQueueTable'
import { UndoHistoryTable } from '../components/UndoHistoryTable'

export function ReviewQueuePage(props: {
  onOpenWorkbench?: (queueItemId: string | null) => void
}) {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [items, setItems] = useState<ReviewQueueItem[]>([])
  const [journal, setJournal] = useState<DecisionJournalEntry[]>([])

  const refresh = useCallback(async () => {
    setItems(await archiveApi.listReviewQueue({ status: 'pending' }))
    setJournal(await archiveApi.listDecisionJournal())
  }, [archiveApi])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleApprove = async (queueItemId: string) => {
    await archiveApi.approveReviewItem(queueItemId)
    await refresh()
  }

  const handleReject = async (queueItemId: string) => {
    await archiveApi.rejectReviewItem({ queueItemId })
    await refresh()
  }

  const handleUndo = async (journalId: string) => {
    await archiveApi.undoDecision(journalId)
    await refresh()
  }

  return (
    <section>
      <h1>Review Queue</h1>
      {props.onOpenWorkbench ? (
        <button type="button" onClick={() => props.onOpenWorkbench?.(items[0]?.id ?? null)} disabled={items.length === 0}>
          Open Workbench
        </button>
      ) : null}
      <ReviewQueueTable items={items} onApprove={handleApprove} onReject={handleReject} />
      <h2>Undo History</h2>
      <UndoHistoryTable entries={journal} onUndo={handleUndo} />
    </section>
  )
}
