import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReviewWorkbenchDetail, ReviewWorkbenchListItem } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { ReviewActionBar } from '../components/ReviewActionBar'
import { ReviewCandidateSummaryCard } from '../components/ReviewCandidateSummaryCard'
import { ReviewEvidenceTraceCard } from '../components/ReviewEvidenceTraceCard'
import { ReviewImpactPreviewCard } from '../components/ReviewImpactPreviewCard'
import { ReviewWorkbenchSidebar } from '../components/ReviewWorkbenchSidebar'

export function ReviewWorkbenchPage(props: {
  initialQueueItemId?: string | null
}) {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [items, setItems] = useState<ReviewWorkbenchListItem[]>([])
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string | null>(props.initialQueueItemId ?? null)
  const [detail, setDetail] = useState<ReviewWorkbenchDetail | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const selectedQueueItemIdRef = useRef<string | null>(props.initialQueueItemId ?? null)

  useEffect(() => {
    selectedQueueItemIdRef.current = selectedQueueItemId
  }, [selectedQueueItemId])

  const refreshWorkbench = useCallback(async (preferredQueueItemId?: string | null) => {
    const nextItems = await archiveApi.listReviewWorkbenchItems({ status: 'pending' })
    setItems(nextItems)

    const resolvedQueueItemId = preferredQueueItemId
      ?? selectedQueueItemIdRef.current
      ?? props.initialQueueItemId
      ?? nextItems[0]?.queueItemId
      ?? null

    selectedQueueItemIdRef.current = resolvedQueueItemId
    setSelectedQueueItemId(resolvedQueueItemId)

    if (!resolvedQueueItemId) {
      setDetail(null)
      return null
    }

    const nextDetail = await archiveApi.getReviewWorkbenchItem(resolvedQueueItemId)
    setDetail(nextDetail)
    return nextDetail
  }, [archiveApi, props.initialQueueItemId])

  useEffect(() => {
    void refreshWorkbench(props.initialQueueItemId ?? null)
  }, [props.initialQueueItemId, refreshWorkbench])

  const handleSelect = async (queueItemId: string) => {
    setErrorMessage(null)
    selectedQueueItemIdRef.current = queueItemId
    setSelectedQueueItemId(queueItemId)
    setDetail(await archiveApi.getReviewWorkbenchItem(queueItemId))
  }

  const runAction = async (action: () => Promise<unknown>) => {
    if (!detail) {
      return
    }

    setIsBusy(true)
    setErrorMessage(null)
    try {
      await action()
      await refreshWorkbench(detail.queueItem.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unknown review action error')
    } finally {
      setIsBusy(false)
    }
  }

  const selectedItemIsStale = Boolean(
    detail
      && detail.queueItem.status !== 'pending'
      && !items.some((item) => item.queueItemId === detail.queueItem.id)
  )

  return (
    <section>
      <h1>Review Workbench</h1>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {selectedItemIsStale ? <p>Selected item is no longer pending.</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '16px', alignItems: 'start' }}>
        <ReviewWorkbenchSidebar items={items} selectedQueueItemId={selectedQueueItemId} onSelect={(queueItemId) => void handleSelect(queueItemId)} />
        <div>
          {detail ? <ReviewCandidateSummaryCard detail={detail} /> : <p>No workbench item selected.</p>}
          {detail ? <ReviewEvidenceTraceCard trace={detail.trace} /> : null}
        </div>
        <div>
          {detail ? <ReviewImpactPreviewCard preview={detail.impactPreview} /> : <p>No impact preview available.</p>}
          {detail ? (
            <ReviewActionBar
              queueStatus={detail.queueItem.status}
              undoJournalId={detail.impactPreview.undoImpact.affectedJournalId}
              busy={isBusy}
              onApprove={() => void runAction(() => archiveApi.approveReviewItem(detail.queueItem.id))}
              onReject={() => void runAction(() => archiveApi.rejectReviewItem({ queueItemId: detail.queueItem.id }))}
              onUndo={() => {
                const journalId = detail.impactPreview.undoImpact.affectedJournalId
                if (!journalId) {
                  return
                }
                void runAction(() => archiveApi.undoDecision(journalId))
              }}
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}
