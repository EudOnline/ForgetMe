import type { ArchiveDatabase } from './db'

export type ApprovedStructuredField = {
  fileId: string
  fieldType: string
  fieldKey: string
  documentType: string
  value: string
}

export type FileEnrichmentIndex = {
  fileId: string
  enrichedTexts: string[]
  approvedFields: ApprovedStructuredField[]
  timelineSignals: string[]
}

function addUnique(target: string[], values: string[]) {
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || target.includes(normalized)) {
      continue
    }

    target.push(normalized)
  }
}

function collectStringLeaves(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringLeaves(item))
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((item) => collectStringLeaves(item))
  }

  return []
}

function approvedFieldValue(payload: Record<string, unknown>) {
  const values = collectStringLeaves(payload.fieldValue)
  return values[0] ?? ''
}

function ensureRow(map: Map<string, FileEnrichmentIndex>, fileId: string) {
  const existing = map.get(fileId)
  if (existing) {
    return existing
  }

  const created = {
    fileId,
    enrichedTexts: [],
    approvedFields: [],
    timelineSignals: []
  } satisfies FileEnrichmentIndex
  map.set(fileId, created)
  return created
}

function appendEvidence(row: FileEnrichmentIndex, evidenceType: string, payload: Record<string, unknown>) {
  switch (evidenceType) {
    case 'approved_structured_field': {
      const value = approvedFieldValue(payload)
      if (!value) {
        return
      }

      row.approvedFields.push({
        fileId: row.fileId,
        fieldType: typeof payload.fieldType === 'string' ? payload.fieldType : 'document',
        fieldKey: typeof payload.fieldKey === 'string' ? payload.fieldKey : 'unknown',
        documentType: typeof payload.documentType === 'string' ? payload.documentType : 'generic_document',
        value
      })
      addUnique(row.timelineSignals, [value])
      return
    }
    case 'image_summary':
    case 'document_raw_text':
    case 'image_raw_text':
    case 'document_layout_blocks': {
      addUnique(row.enrichedTexts, collectStringLeaves(payload))
      if (evidenceType === 'image_summary') {
        addUnique(row.timelineSignals, collectStringLeaves(payload))
      }
      return
    }
    case 'image_detected_dates':
    case 'image_detected_locations': {
      const values = collectStringLeaves(payload)
      addUnique(row.enrichedTexts, values)
      addUnique(row.timelineSignals, values)
      return
    }
    default:
      return
  }
}

export function loadApprovedEnrichmentIndex(db: ArchiveDatabase, input?: { fileIds?: string[] }) {
  const fileIds = [...new Set(input?.fileIds?.filter((fileId) => fileId.trim().length > 0) ?? [])]
  if (input?.fileIds && fileIds.length === 0) {
    return new Map<string, FileEnrichmentIndex>()
  }

  const params = ['approved', ...(fileIds.length > 0 ? fileIds : [])]
  const fileClause = fileIds.length > 0 ? ` and file_id in (${fileIds.map(() => '?').join(', ')})` : ''
  const rows = db.prepare(
    `select file_id as fileId, evidence_type as evidenceType, payload_json as payloadJson
     from enriched_evidence
     where status = ?${fileClause}
     order by created_at asc`
  ).all(...params) as Array<{
    fileId: string
    evidenceType: string
    payloadJson: string
  }>

  const index = new Map<string, FileEnrichmentIndex>()

  for (const entry of rows) {
    const row = ensureRow(index, entry.fileId)
    const payload = JSON.parse(entry.payloadJson) as Record<string, unknown>
    appendEvidence(row, entry.evidenceType, payload)
  }

  return index
}

export function buildEnrichedSearchRow(input: {
  fileName: string
  payloadJson?: string | null
  matchedPeople?: string[]
  enrichedTexts?: string[]
  approvedFields?: string[]
}) {
  const segments = [
    input.fileName,
    input.payloadJson ?? '',
    ...(input.matchedPeople ?? []),
    ...(input.enrichedTexts ?? []),
    ...(input.approvedFields ?? [])
  ]
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

  return {
    haystack: [...new Set(segments)].join(' ')
  }
}
