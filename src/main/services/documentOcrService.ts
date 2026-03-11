import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import { classifyFieldRisk } from './fieldRiskService'

export type DocumentType = 'id_card' | 'driver_license' | 'transcript' | 'generic_document'

export type DocumentLayoutBlock = {
  page: number
  text: string
  bbox?: number[]
}

export type StructuredDocumentField = {
  fieldType: string
  fieldKey: string
  value: string
}

export type DocumentExtraction = {
  generic: {
    rawText: string
    layoutBlocks: DocumentLayoutBlock[]
  }
  typed: {
    documentType: Exclude<DocumentType, 'generic_document'>
    fields: StructuredDocumentField[]
  } | null
}

const DOCUMENT_FIELD_TYPES = {
  id_card: {
    full_name: 'identity',
    national_id_number: 'identity',
    address: 'identity',
    birth_date: 'identity'
  },
  driver_license: {
    full_name: 'license',
    license_number: 'license',
    address: 'license',
    vehicle_class: 'license',
    valid_until: 'license'
  },
  transcript: {
    school_name: 'education',
    student_name: 'education',
    major_name: 'education',
    score_value: 'education',
    gpa_value: 'education'
  }
} as const

function normalizeDocumentType(documentType: string): DocumentType {
  if (documentType === 'id_card' || documentType === 'driver_license' || documentType === 'transcript') {
    return documentType
  }

  return 'generic_document'
}

function fieldTypeFor(documentType: Exclude<DocumentType, 'generic_document'>, fieldKey: string) {
  return DOCUMENT_FIELD_TYPES[documentType][fieldKey as keyof typeof DOCUMENT_FIELD_TYPES[typeof documentType]] ?? 'document'
}



export function normalizeDocumentExtraction(input: {
  documentType: string
  rawText: string
  layoutBlocks?: DocumentLayoutBlock[]
  fields?: Record<string, string | null | undefined>
}): DocumentExtraction {
  const documentType = normalizeDocumentType(input.documentType)
  const generic = {
    rawText: input.rawText,
    layoutBlocks: input.layoutBlocks ?? []
  }

  if (documentType === 'generic_document') {
    return {
      generic,
      typed: null
    }
  }

  const fields = Object.entries(input.fields ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
    .map(([fieldKey, value]) => ({
      fieldType: fieldTypeFor(documentType, fieldKey),
      fieldKey,
      value
    }))

  return {
    generic,
    typed: {
      documentType,
      fields
    }
  }
}

export function persistDocumentExtraction(db: ArchiveDatabase, input: {
  fileId: string
  jobId: string
  extraction: DocumentExtraction
}) {
  const fieldCandidates = [] as Array<{ candidateId: string; fieldKey: string; confidence: number }>
  const createdAt = new Date().toISOString()
  const insertArtifact = db.prepare(
    'insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)'
  )
  const insertEvidence = db.prepare(
    `insert into enriched_evidence (
      id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertCandidate = db.prepare(
    `insert into structured_field_candidates (
      id, file_id, job_id, field_type, field_key, field_value_json, document_type,
      confidence, risk_level, source_page, source_span_json, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  insertArtifact.run(
    crypto.randomUUID(),
    input.jobId,
    'ocr_raw_text',
    JSON.stringify({ rawText: input.extraction.generic.rawText }),
    createdAt
  )

  insertArtifact.run(
    crypto.randomUUID(),
    input.jobId,
    'ocr_layout_blocks',
    JSON.stringify({ layoutBlocks: input.extraction.generic.layoutBlocks }),
    createdAt
  )

  insertEvidence.run(
    crypto.randomUUID(),
    input.fileId,
    input.jobId,
    'document_raw_text',
    JSON.stringify({ rawText: input.extraction.generic.rawText }),
    'low',
    'approved',
    createdAt,
    createdAt
  )

  insertEvidence.run(
    crypto.randomUUID(),
    input.fileId,
    input.jobId,
    'document_layout_blocks',
    JSON.stringify({ layoutBlocks: input.extraction.generic.layoutBlocks }),
    'low',
    'approved',
    createdAt,
    createdAt
  )

  if (!input.extraction.typed) {
    return { fieldCandidates }
  }

  for (const field of input.extraction.typed.fields) {
    const riskLevel = classifyFieldRisk({ fieldKey: field.fieldKey })
    if (riskLevel !== 'high') {
      continue
    }

    const candidateId = crypto.randomUUID()

    insertCandidate.run(
      candidateId,
      input.fileId,
      input.jobId,
      field.fieldType,
      field.fieldKey,
      JSON.stringify({ value: field.value }),
      input.extraction.typed.documentType,
      0.9,
      riskLevel,
      input.extraction.generic.layoutBlocks[0]?.page ?? null,
      null,
      'pending',
      createdAt
    )

    fieldCandidates.push({
      candidateId,
      fieldKey: field.fieldKey,
      confidence: 0.9
    })
  }

  return { fieldCandidates }
}
