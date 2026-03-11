import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import { classifyFieldRisk } from './fieldRiskService'

export type ImageType = 'chat_screenshot' | 'generic_image'

export type ImageExtraction = {
  generic: {
    imageSummary: string
    rawText: string
    detectedDates: string[]
    detectedLocations: string[]
  }
  typed: {
    imageType: ImageType
    participantFragments: string[]
  } | null
}

function normalizeImageType(imageType: string): ImageType {
  return imageType === 'chat_screenshot' ? 'chat_screenshot' : 'generic_image'
}

export function normalizeImageExtraction(input: {
  imageType: string
  summary: string
  transcriptText?: string
  participantFragments?: string[]
  detectedDates?: string[]
  detectedLocations?: string[]
}): ImageExtraction {
  const imageType = normalizeImageType(input.imageType)

  return {
    generic: {
      imageSummary: input.summary,
      rawText: input.transcriptText ?? '',
      detectedDates: input.detectedDates ?? [],
      detectedLocations: input.detectedLocations ?? []
    },
    typed: imageType === 'chat_screenshot'
      ? {
          imageType,
          participantFragments: input.participantFragments ?? []
        }
      : null
  }
}

export function persistImageExtraction(db: ArchiveDatabase, input: {
  fileId: string
  jobId: string
  extraction: ImageExtraction
}) {
  const fieldCandidates = [] as Array<{ candidateId: string; fieldKey: string; confidence: number }>
  const createdAt = new Date().toISOString()
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

  insertEvidence.run(
    crypto.randomUUID(),
    input.fileId,
    input.jobId,
    'image_summary',
    JSON.stringify({ imageSummary: input.extraction.generic.imageSummary }),
    'low',
    'approved',
    createdAt,
    createdAt
  )

  insertEvidence.run(
    crypto.randomUUID(),
    input.fileId,
    input.jobId,
    'image_raw_text',
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
    'image_detected_dates',
    JSON.stringify({ detectedDates: input.extraction.generic.detectedDates }),
    'low',
    'approved',
    createdAt,
    createdAt
  )

  insertEvidence.run(
    crypto.randomUUID(),
    input.fileId,
    input.jobId,
    'image_detected_locations',
    JSON.stringify({ detectedLocations: input.extraction.generic.detectedLocations }),
    'low',
    'approved',
    createdAt,
    createdAt
  )

  for (const participantFragment of input.extraction.typed?.participantFragments ?? []) {
    const candidateId = crypto.randomUUID()

    insertCandidate.run(
      candidateId,
      input.fileId,
      input.jobId,
      'image_participant',
      'participant_fragment',
      JSON.stringify({ value: participantFragment }),
      input.extraction.typed?.imageType ?? 'generic_image',
      0.8,
      classifyFieldRisk({ fieldKey: 'participant_fragment' }),
      null,
      null,
      'pending',
      createdAt
    )

    fieldCandidates.push({
      candidateId,
      fieldKey: 'participant_fragment',
      confidence: 0.8
    })
  }

  return { fieldCandidates }
}
