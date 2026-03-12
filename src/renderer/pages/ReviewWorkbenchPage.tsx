import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ReviewConflictGroupSummary,
  ReviewInboxPersonSummary,
  ReviewWorkbenchDetail,
  ReviewWorkbenchListItem
} from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { ReviewActionBar } from '../components/ReviewActionBar'
import { ReviewCandidateSummaryCard } from '../components/ReviewCandidateSummaryCard'
import {
  ReviewConflictCompareCard,
  type ReviewConflictCompareValueCount
} from '../components/ReviewConflictCompareCard'
import { ReviewConflictGroupSidebar } from '../components/ReviewConflictGroupSidebar'
import { ReviewContinuousNavigationBar } from '../components/ReviewContinuousNavigationBar'
import { ReviewEvidenceTraceCard } from '../components/ReviewEvidenceTraceCard'
import { ReviewImpactPreviewCard } from '../components/ReviewImpactPreviewCard'
import { ReviewInboxSidebar } from '../components/ReviewInboxSidebar'
import { ReviewWorkbenchSidebar } from '../components/ReviewWorkbenchSidebar'

function toPersonKey(canonicalPersonId: string | null) {
  return canonicalPersonId ?? '__unassigned__'
}

function toConflictGroupKey(item: ReviewWorkbenchListItem) {
  return `${toPersonKey(item.canonicalPersonId)}::${item.itemType}::${item.fieldKey ?? '__unkeyed__'}`
}

function toCompareValue(item: ReviewWorkbenchListItem) {
  return item.displayValue || item.fieldKey || item.itemType
}

function filterItemsByPerson(items: ReviewWorkbenchListItem[], personKey: string | null) {
  if (!personKey) {
    return items
  }

  return items.filter((item) => toPersonKey(item.canonicalPersonId) === personKey)
}

function filterItemsByConflictGroup(items: ReviewWorkbenchListItem[], groupKey: string | null) {
  if (!groupKey) {
    return items
  }

  return items.filter((item) => toConflictGroupKey(item) === groupKey)
}

function filterConflictGroupsByPerson(groups: ReviewConflictGroupSummary[], personKey: string | null) {
  if (!personKey) {
    return groups
  }

  return groups.filter((group) => toPersonKey(group.canonicalPersonId) === personKey)
}

function resolvePersonKeyFromQueueItem(items: ReviewWorkbenchListItem[], queueItemId: string | null | undefined) {
  if (!queueItemId) {
    return null
  }

  const matched = items.find((item) => item.queueItemId === queueItemId)
  return matched ? toPersonKey(matched.canonicalPersonId) : null
}

function buildDistinctValueCounts(items: ReviewWorkbenchListItem[], preferredOrder: string[]) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const value = toCompareValue(item)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  const results: ReviewConflictCompareValueCount[] = []
  const seen = new Set<string>()

  for (const value of preferredOrder) {
    if (seen.has(value)) {
      continue
    }

    results.push({ value, count: counts.get(value) ?? 0 })
    seen.add(value)
  }

  for (const item of items) {
    const value = toCompareValue(item)
    if (seen.has(value)) {
      continue
    }

    results.push({ value, count: counts.get(value) ?? 0 })
    seen.add(value)
  }

  return results
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || target.isContentEditable
}

export function ReviewWorkbenchPage(props: {
  initialQueueItemId?: string | null
}) {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [items, setItems] = useState<ReviewWorkbenchListItem[]>([])
  const [peopleInbox, setPeopleInbox] = useState<ReviewInboxPersonSummary[]>([])
  const [conflictGroups, setConflictGroups] = useState<ReviewConflictGroupSummary[]>([])
  const [selectedInboxPersonKey, setSelectedInboxPersonKey] = useState<string | null>(null)
  const [selectedConflictGroupKey, setSelectedConflictGroupKey] = useState<string | null>(null)
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string | null>(props.initialQueueItemId ?? null)
  const [detail, setDetail] = useState<ReviewWorkbenchDetail | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const selectedQueueItemIdRef = useRef<string | null>(props.initialQueueItemId ?? null)
  const selectedInboxPersonKeyRef = useRef<string | null>(null)
  const selectedConflictGroupKeyRef = useRef<string | null>(null)

  useEffect(() => {
    selectedQueueItemIdRef.current = selectedQueueItemId
  }, [selectedQueueItemId])

  useEffect(() => {
    selectedInboxPersonKeyRef.current = selectedInboxPersonKey
  }, [selectedInboxPersonKey])

  useEffect(() => {
    selectedConflictGroupKeyRef.current = selectedConflictGroupKey
  }, [selectedConflictGroupKey])

  const refreshWorkbench = useCallback(async (
    preferredQueueItemId?: string | null,
    preferredPersonKey?: string | null,
    preferredConflictGroupKey?: string | null
  ) => {
    const [nextPeopleInbox, nextConflictGroups, nextItems] = await Promise.all([
      archiveApi.listReviewInboxPeople(),
      archiveApi.listReviewConflictGroups(),
      archiveApi.listReviewWorkbenchItems({ status: 'pending' })
    ])

    setPeopleInbox(nextPeopleInbox)
    setConflictGroups(nextConflictGroups)
    setItems(nextItems)

    let resolvedPersonKey = preferredPersonKey !== undefined
      ? preferredPersonKey
      : selectedInboxPersonKeyRef.current
        ?? resolvePersonKeyFromQueueItem(nextItems, preferredQueueItemId ?? selectedQueueItemIdRef.current ?? props.initialQueueItemId ?? null)

    let personScopedItems = filterItemsByPerson(nextItems, resolvedPersonKey)
    if (resolvedPersonKey && personScopedItems.length === 0) {
      resolvedPersonKey = null
      personScopedItems = nextItems
    }

    let resolvedConflictGroupKey = preferredConflictGroupKey !== undefined
      ? preferredConflictGroupKey
      : selectedConflictGroupKeyRef.current

    let visibleGroups = filterConflictGroupsByPerson(nextConflictGroups, resolvedPersonKey)
    if (resolvedConflictGroupKey && !visibleGroups.some((group) => group.groupKey === resolvedConflictGroupKey)) {
      resolvedConflictGroupKey = null
    }

    let visibleItems = filterItemsByConflictGroup(personScopedItems, resolvedConflictGroupKey)
    if (resolvedConflictGroupKey && visibleItems.length === 0) {
      resolvedConflictGroupKey = null
      visibleItems = personScopedItems
    }

    if (resolvedPersonKey && visibleItems.length === 0) {
      resolvedPersonKey = null
      resolvedConflictGroupKey = null
      personScopedItems = nextItems
      visibleGroups = nextConflictGroups
      visibleItems = nextItems
    }

    setSelectedInboxPersonKey(resolvedPersonKey)
    selectedInboxPersonKeyRef.current = resolvedPersonKey
    setSelectedConflictGroupKey(resolvedConflictGroupKey)
    selectedConflictGroupKeyRef.current = resolvedConflictGroupKey

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

  const handleSelect = useCallback(async (queueItemId: string) => {
    setErrorMessage(null)
    selectedQueueItemIdRef.current = queueItemId
    setSelectedQueueItemId(queueItemId)
    setDetail(await archiveApi.getReviewWorkbenchItem(queueItemId))
  }, [archiveApi])

  const handleSelectPerson = async (person: ReviewInboxPersonSummary) => {
    setErrorMessage(null)
    await refreshWorkbench(person.nextQueueItemId, toPersonKey(person.canonicalPersonId), null)
  }

  const handleSelectConflictGroup = async (group: ReviewConflictGroupSummary) => {
    setErrorMessage(null)
    await refreshWorkbench(group.nextQueueItemId, toPersonKey(group.canonicalPersonId), group.groupKey)
  }

  const runAction = async (action: () => Promise<unknown>) => {
    if (!detail) {
      return
    }

    setIsBusy(true)
    setErrorMessage(null)
    try {
      await action()
      await refreshWorkbench(undefined, selectedInboxPersonKeyRef.current, selectedConflictGroupKeyRef.current)
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

  const visibleGroups = useMemo(
    () => filterConflictGroupsByPerson(conflictGroups, selectedInboxPersonKey),
    [conflictGroups, selectedInboxPersonKey]
  )

  const visibleItems = useMemo(
    () => filterItemsByConflictGroup(filterItemsByPerson(items, selectedInboxPersonKey), selectedConflictGroupKey),
    [items, selectedInboxPersonKey, selectedConflictGroupKey]
  )

  const selectedConflictGroup = useMemo(
    () => selectedConflictGroupKey
      ? visibleGroups.find((group) => group.groupKey === selectedConflictGroupKey)
        ?? conflictGroups.find((group) => group.groupKey === selectedConflictGroupKey)
        ?? null
      : null,
    [conflictGroups, selectedConflictGroupKey, visibleGroups]
  )

  const compareSummary = useMemo(() => {
    if (!selectedConflictGroup) {
      return null
    }

    return {
      fieldKey: selectedConflictGroup.fieldKey,
      pendingCount: visibleItems.length,
      distinctValuesWithCounts: buildDistinctValueCounts(visibleItems, selectedConflictGroup.distinctValues),
      hasConflict: selectedConflictGroup.hasConflict
    }
  }, [selectedConflictGroup, visibleItems])

  const selectedVisibleItemIndex = useMemo(
    () => visibleItems.findIndex((item) => item.queueItemId === selectedQueueItemId),
    [selectedQueueItemId, visibleItems]
  )

  const currentNavigationIndex = visibleItems.length === 0
    ? 0
    : selectedVisibleItemIndex >= 0
      ? selectedVisibleItemIndex + 1
      : 1

  const navigateToIndex = useCallback(async (index: number) => {
    const nextItem = visibleItems[index]
    if (!nextItem || nextItem.queueItemId === selectedQueueItemIdRef.current) {
      return
    }

    await handleSelect(nextItem.queueItemId)
  }, [handleSelect, visibleItems])

  const handleNavigatePrevious = useCallback(async () => {
    if (selectedVisibleItemIndex <= 0) {
      return
    }

    await navigateToIndex(selectedVisibleItemIndex - 1)
  }, [navigateToIndex, selectedVisibleItemIndex])

  const handleNavigateNext = useCallback(async () => {
    if (selectedVisibleItemIndex < 0 || selectedVisibleItemIndex >= visibleItems.length - 1) {
      return
    }

    await navigateToIndex(selectedVisibleItemIndex + 1)
  }, [navigateToIndex, selectedVisibleItemIndex, visibleItems.length])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        void handleNavigateNext()
        return
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        void handleNavigatePrevious()
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown)
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleNavigateNext, handleNavigatePrevious])

  return (
    <section>
      <h1>Review Workbench</h1>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {selectedItemIsStale ? <p>Selected item is no longer pending.</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1fr', gap: '16px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '16px' }}>
          <ReviewInboxSidebar
            people={peopleInbox}
            selectedPersonKey={selectedInboxPersonKey}
            onSelectPerson={handleSelectPerson}
            onShowAll={() => void refreshWorkbench(undefined, null, null)}
          />
          <ReviewConflictGroupSidebar
            groups={visibleGroups}
            selectedGroupKey={selectedConflictGroupKey}
            onSelectGroup={handleSelectConflictGroup}
            onShowAll={() => void refreshWorkbench(undefined, selectedInboxPersonKeyRef.current ?? null, null)}
          />
        </div>
        <ReviewWorkbenchSidebar items={visibleItems} selectedQueueItemId={selectedQueueItemId} onSelect={(queueItemId) => void handleSelect(queueItemId)} />
        <div>
          {compareSummary ? (
            <ReviewConflictCompareCard
              fieldKey={compareSummary.fieldKey}
              pendingCount={compareSummary.pendingCount}
              distinctValuesWithCounts={compareSummary.distinctValuesWithCounts}
              hasConflict={compareSummary.hasConflict}
            />
          ) : null}
          {visibleItems.length > 0 ? (
            <ReviewContinuousNavigationBar
              currentIndex={currentNavigationIndex}
              totalCount={visibleItems.length}
              canGoPrevious={selectedVisibleItemIndex > 0}
              canGoNext={selectedVisibleItemIndex >= 0 && selectedVisibleItemIndex < visibleItems.length - 1}
              onPrevious={handleNavigatePrevious}
              onNext={handleNavigateNext}
            />
          ) : null}
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
