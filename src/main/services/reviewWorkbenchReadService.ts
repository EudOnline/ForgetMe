import type {
  ProfileAttributeCandidate,
  ReviewWorkbenchDetail,
  ReviewWorkbenchListItem,
  StructuredFieldCandidate
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { buildReviewImpactPreview } from './reviewImpactService'
import { listPersonProfileAttributes } from './profileReadService'
import { getReviewEvidenceTrace } from './reviewEvidenceTraceService'

type ReviewWorkbenchFilter = {
  itemType?: 'structured_field_candidate' | 'profile_attribute_candidate'
  status?: 'pending' | 'approved' | 'rejected' | 'undone'
  canonicalPersonId?: string
  fieldKey?: string
  hasConflict?: boolean
}

type ReviewQueueRow = {
  id: string
}

function isStructuredCandidate(candidate: StructuredFieldCandidate | ProfileAttributeCandidate | null): candidate is StructuredFieldCandidate {
  return Boolean(candidate && 'fieldType' in candidate)
}

function isProfileCandidate(candidate: StructuredFieldCandidate | ProfileAttributeCandidate | null): candidate is ProfileAttributeCandidate {
  return Boolean(candidate && 'attributeGroup' in candidate)
}

function loadCanonicalPersonName(db: ArchiveDatabase, canonicalPersonId: string | null) {
  if (!canonicalPersonId) {
    return null
  }

  const row = db.prepare(
    `select primary_display_name as primaryDisplayName
     from canonical_people
     where id = ?`
  ).get(canonicalPersonId) as { primaryDisplayName: string } | undefined

  return row?.primaryDisplayName ?? null
}

function deriveDisplayValue(candidate: StructuredFieldCandidate | ProfileAttributeCandidate | null) {
  if (!candidate) {
    return ''
  }

  if (isStructuredCandidate(candidate)) {
    return candidate.fieldValue
  }

  return candidate.displayValue
}

function deriveFieldKey(candidate: StructuredFieldCandidate | ProfileAttributeCandidate | null) {
  if (!candidate) {
    return null
  }

  if (isStructuredCandidate(candidate)) {
    return candidate.fieldKey
  }

  return candidate.attributeKey
}

function deriveCanonicalPersonId(candidate: StructuredFieldCandidate | ProfileAttributeCandidate | null, impactPreview: ReviewWorkbenchDetail['impactPreview']) {
  if (isProfileCandidate(candidate)) {
    return candidate.proposedCanonicalPersonId
      ?? impactPreview.approveImpact.canonicalPersonId
      ?? impactPreview.rejectImpact.canonicalPersonId
      ?? impactPreview.undoImpact.canonicalPersonId
      ?? null
  }

  return impactPreview.approveImpact.canonicalPersonId
    ?? impactPreview.rejectImpact.canonicalPersonId
    ?? impactPreview.undoImpact.canonicalPersonId
    ?? null
}

function deriveHasConflict(impactPreview: ReviewWorkbenchDetail['impactPreview']) {
  const { currentValue, nextValue } = impactPreview.approveImpact
  return Boolean(
    currentValue
      && nextValue
      && currentValue !== nextValue
  )
}

function buildWorkbenchListItem(db: ArchiveDatabase, detail: Omit<ReviewWorkbenchDetail, 'item'>): ReviewWorkbenchListItem {
  const fieldKey = deriveFieldKey(detail.candidate)
  const canonicalPersonId = deriveCanonicalPersonId(detail.candidate, detail.impactPreview)
  const canonicalPersonName = detail.impactPreview.approveImpact.canonicalPersonName
    ?? loadCanonicalPersonName(db, canonicalPersonId)
  const hasConflict = deriveHasConflict(detail.impactPreview)

  return {
    queueItemId: detail.queueItem.id,
    itemType: detail.queueItem.itemType as 'structured_field_candidate' | 'profile_attribute_candidate',
    candidateId: detail.queueItem.candidateId,
    status: detail.queueItem.status,
    priority: detail.queueItem.priority,
    confidence: detail.queueItem.confidence,
    summary: detail.queueItem.summary,
    canonicalPersonId,
    canonicalPersonName,
    fieldKey,
    displayValue: deriveDisplayValue(detail.candidate),
    hasConflict,
    createdAt: detail.queueItem.createdAt,
    reviewedAt: detail.queueItem.reviewedAt
  }
}

export function getReviewWorkbenchItem(db: ArchiveDatabase, input: { queueItemId: string }): ReviewWorkbenchDetail {
  const trace = getReviewEvidenceTrace(db, input)
  const impactPreview = buildReviewImpactPreview(db, input)
  const canonicalPersonId = deriveCanonicalPersonId(trace.candidate, impactPreview)
  const currentProfileAttributes = listPersonProfileAttributes(db, {
    canonicalPersonId: canonicalPersonId ?? undefined,
    status: 'active'
  })
  const item = buildWorkbenchListItem(db, {
    queueItem: trace.queueItem,
    candidate: trace.candidate,
    trace,
    impactPreview,
    currentProfileAttributes
  })

  return {
    item,
    queueItem: trace.queueItem,
    candidate: trace.candidate,
    trace,
    impactPreview,
    currentProfileAttributes
  }
}

export function listReviewWorkbenchItems(db: ArchiveDatabase, filter: ReviewWorkbenchFilter = {}) {
  const rows = db.prepare(
    `select id
     from review_queue
     where item_type in ('structured_field_candidate', 'profile_attribute_candidate')
     order by created_at asc, id asc`
  ).all() as ReviewQueueRow[]

  return rows
    .map((row) => getReviewWorkbenchItem(db, { queueItemId: row.id }).item)
    .filter((item) => (filter.itemType ? item.itemType === filter.itemType : true))
    .filter((item) => (filter.status ? item.status === filter.status : true))
    .filter((item) => (filter.canonicalPersonId ? item.canonicalPersonId === filter.canonicalPersonId : true))
    .filter((item) => (filter.fieldKey ? item.fieldKey === filter.fieldKey : true))
    .filter((item) => (typeof filter.hasConflict === 'boolean' ? item.hasConflict === filter.hasConflict : true))
}
