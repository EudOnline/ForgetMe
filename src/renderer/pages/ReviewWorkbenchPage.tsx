import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReviewInboxPersonSummary, ReviewWorkbenchDetail, ReviewWorkbenchListItem } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { ReviewActionBar } from '../components/ReviewActionBar'
import { ReviewCandidateSummaryCard } from '../components/ReviewCandidateSummaryCard'
import { ReviewEvidenceTraceCard } from '../components/ReviewEvidenceTraceCard'
import { ReviewImpactPreviewCard } from '../components/ReviewImpactPreviewCard'
import { ReviewInboxSidebar } from '../components/ReviewInboxSidebar'
import { ReviewWorkbenchSidebar } from '../components/ReviewWorkbenchSidebar'

function toPersonKey(canonicalPersonId: string | null) {
  return canonicalPersonId ?? '__unassigned__'
}

function filterItemsByPerson(items: ReviewWorkbenchListItem[], personKey: string | null) {
  if (!personKey) {
    return items
  }

  return items.filter((item) => toPersonKey(item.canonicalPersonId) === personKey)
}

function resolvePersonKeyFromQueueItem(items: ReviewWorkbenchListItem[], queueItemId: string | null | undefined) {
  if (!queueItemId) {
    return null
  }

  const matched = items.find((item) => item.queueItemId === queueItemId)
  return matched ? toPersonKey(matched.canonicalPersonId) : null
}

export function ReviewWorkbenchPage(props: {
  initialQueueItemId?: string | null
}) {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [items, setItems] = useState<ReviewWorkbenchListItem[]>([])
  const [peopleInbox, setPeopleInbox] = useState<ReviewInboxPersonSummary[]>([])
  const [selectedInboxPersonKey, setSelectedInboxPersonKey] = useState<string | null>(null)
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string | null>(props.initialQueueItemId ?? null)
  const [detail, setDetail] = useState<ReviewWorkbenchDetail | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const selectedQueueItemIdRef = useRef<string | null>(props.initialQueueItemId ?? null)
  const selectedInboxPersonKeyRef = useRef<string | null>(null)

  useEffect(() => {
    selectedQueueItemIdRef.current = selectedQueueItemId
  }, [selectedQueueItemId])

  useEffect(() => {
    selectedInboxPersonKeyRef.current = selectedInboxPersonKey
  }, [selectedInboxPersonKey])

  const refreshWorkbench = useCallback(async (preferredQueueItemId?: string | null, preferredPersonKey?: string | null) => {
    const [nextPeopleInbox, nextItems] = await Promise.all([
      archiveApi.listReviewInboxPeople(),
      archiveApi.listReviewWorkbenchItems({ status: 'pending' })
    ])

    setPeopleInbox(nextPeopleInbox)
    setItems(nextItems)

    let resolvedPersonKey = preferredPersonKey !== undefined
      ? preferredPersonKey
      : selectedInboxPersonKeyRef.current
        ?? resolvePersonKeyFromQueueItem(nextItems, preferredQueueItemId ?? selectedQueueItemIdRef.current ?? props.initialQueueItemId ?? null)

    let visibleItems = filterItemsByPerson(nextItems, resolvedPersonKey)
    if (resolvedPersonKey && visibleItems.length === 0) {
      resolvedPersonKey = null
      visibleItems = nextItems
    }

    setSelectedInboxPersonKey(resolvedPersonKey)
    selectedInboxPersonKeyRef.current = resolvedPersonKey

    const candidateQueueItemIds = [
      preferredQueueItemId,
      selectedQueueItemIdRef.current,
      props.initialQueueItemId
    ].filter((value): value is string => Boolean(value))

    const resolvedQueueItemId = candidateQueueItemIds.find((queueItemId) => visibleItems.some((item) => item.queueItemId === queueItemId))
      ?? visibleItems[0]?.queueItemId
      ?? null
    const staleQueueItemId = candidateQueueItemIds[0] ?? null

    selectedQueueItemIdRef.current = resolvedQueueItemId ?? staleQueueItemId
    setSelectedQueueItemId(resolvedQueueItemId ?? staleQueueItemId)

    if (!resolvedQueueItemId) {
      if (!staleQueueItemId) {
        setDetail(null)
        return null
      }

      const staleDetail = await archiveApi.getReviewWorkbenchItem(staleQueueItemId)
      setDetail(staleDetail)
      return staleDetail
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

  const handleSelectPerson = async (person: ReviewInboxPersonSummary) => {
    setErrorMessage(null)
    await refreshWorkbench(person.nextQueueItemId, toPersonKey(person.canonicalPersonId))
  }

  const runAction = async (action: () => Promise<unknown>) => {
    if (!detail) {
      return
    }

    setIsBusy(true)
    setErrorMessage(null)
    try {
      await action()
      await refreshWorkbench(undefined, selectedInboxPersonKeyRef.current)
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

  const visibleItems = useMemo(
    () => filterItemsByPerson(items, selectedInboxPersonKey),
    [items, selectedInboxPersonKey]
  )

  return (
    <section>
      <h1>Review Workbench</h1>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {selectedItemIsStale ? <p>Selected item is no longer pending.</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1fr', gap: '16px', alignItems: 'start' }}>
        <ReviewInboxSidebar
          people={peopleInbox}
          selectedPersonKey={selectedInboxPersonKey}
          onSelectPerson={handleSelectPerson}
          onShowAll={() => void refreshWorkbench(undefined, null)}
        />
        <ReviewWorkbenchSidebar items={visibleItems} selectedQueueItemId={selectedQueueItemId} onSelect={(queueItemId) => void handleSelect(queueItemId)} />
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
