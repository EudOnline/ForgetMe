import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DecisionJournalEntry, ReviewQueueItem } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { ReviewQueueTable } from '../components/ReviewQueueTable'
import { UndoHistoryTable } from '../components/UndoHistoryTable'

export function ReviewQueuePage(props: {
  onOpenWorkbench?: (queueItemId: string | null) => void
  initialJournalQuery?: string | null
  initialSelectedJournalId?: string | null
}) {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [items, setItems] = useState<ReviewQueueItem[]>([])
  const [journal, setJournal] = useState<DecisionJournalEntry[]>([])
  const [journalQuery, setJournalQuery] = useState(props.initialJournalQuery ?? '')
  const [appliedJournalQuery, setAppliedJournalQuery] = useState(props.initialJournalQuery ?? '')
  const [selectedJournal, setSelectedJournal] = useState<DecisionJournalEntry | null>(null)

  useEffect(() => {
    setJournalQuery(props.initialJournalQuery ?? '')
    setAppliedJournalQuery(props.initialJournalQuery ?? '')
  }, [props.initialJournalQuery])

  const refresh = useCallback(async () => {
    setItems(await archiveApi.listReviewQueue({ status: 'pending' }))
    const nextJournal = await archiveApi.listDecisionJournal(appliedJournalQuery ? { query: appliedJournalQuery } : undefined) ?? []
    setJournal(nextJournal)
    setSelectedJournal((current) => {
      const preferredJournalId = props.initialSelectedJournalId ?? current?.id ?? null
      return nextJournal.find((entry) => entry.id === preferredJournalId) ?? nextJournal[0] ?? null
    })
  }, [archiveApi, appliedJournalQuery, props.initialSelectedJournalId])

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
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setAppliedJournalQuery(journalQuery)
        }}
      >
        <label>
          Search history
          <input value={journalQuery} onChange={(event) => setJournalQuery(event.target.value)} />
        </label>
        <button type="submit">Filter History</button>
      </form>
      <UndoHistoryTable entries={journal} onUndo={handleUndo} onReplay={setSelectedJournal} />
      {selectedJournal ? (
        <section>
          <h3>Replay Detail</h3>
          <p>{selectedJournal.replaySummary ?? selectedJournal.decisionType}</p>
          <p>{selectedJournal.actor}</p>
          <pre>{JSON.stringify(selectedJournal.operationPayload, null, 2)}</pre>
          <pre>{JSON.stringify(selectedJournal.undoPayload, null, 2)}</pre>
        </section>
      ) : null}
    </section>
  )
}
