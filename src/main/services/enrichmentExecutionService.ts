import type { ArchiveDatabase } from './db'
import { normalizeDocumentExtraction, persistDocumentExtraction } from './documentOcrService'
import { normalizeImageExtraction, persistImageExtraction } from './imageUnderstandingService'
import { resolveModelRoute, callLiteLLM } from './modelGatewayService'
import { queueStructuredFieldCandidate } from './enrichmentReviewService'
import { completeEnrichmentJob, failEnrichmentJob } from './enrichmentRunnerService'
import {
  buildProviderBoundaryRequest,
  persistProviderEgressError,
  persistProviderEgressRequest,
  persistProviderEgressResponse,
  type ProviderBoundaryJob
} from './providerBoundaryService'

type ExecutionJobRow = ProviderBoundaryJob & {
  status: string
}

type ModelCallResult = {
  provider: string
  model: string
  usage: Record<string, unknown> | null
  receivedAt: string
  payload: Record<string, unknown>
}

function getExecutionJob(db: ArchiveDatabase, jobId: string) {
  const job = db.prepare(
    `select
      ej.id as id,
      ej.file_id as fileId,
      vf.file_name as fileName,
      vf.frozen_path as frozenPath,
      vf.sha256 as fileSha256,
      vf.extension as extension,
      vf.mime_type as mimeType,
      ej.enhancer_type as enhancerType,
      ej.provider as provider,
      ej.model as model,
      ej.status as status
     from enrichment_jobs ej
     join vault_files vf on vf.id = ej.file_id
     where ej.id = ?`
  ).get(jobId) as ExecutionJobRow | undefined

  if (!job) {
    throw new Error(`Enrichment job not found: ${jobId}`)
  }

  return job
}

function readMessageContent(payload: Record<string, unknown>) {
  const choices = payload.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('Model response is missing choices')
  }

  const firstChoice = choices[0]
  if (!firstChoice || typeof firstChoice !== 'object') {
    throw new Error('Model response choice is invalid')
  }

  const message = (firstChoice as { message?: unknown }).message
  if (!message || typeof message !== 'object') {
    throw new Error('Model response is missing message payload')
  }

  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text
        }
        return ''
      })
      .filter((part) => part.length > 0)

    if (parts.length > 0) {
      return parts.join('\n')
    }
  }

  throw new Error('Model response content is not a supported text format')
}

function parseExtractionPayload(payload: Record<string, unknown>) {
  const content = readMessageContent(payload)
  const normalizedContent = content.trim()
  if (normalizedContent.length === 0) {
    throw new Error('Model response content is empty')
  }

  return JSON.parse(normalizedContent) as Record<string, unknown>
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []
}

function loadPendingStructuredFieldCandidates(db: ArchiveDatabase, jobId: string) {
  return db.prepare(
    `select
      id as candidateId,
      field_key as fieldKey,
      confidence
     from structured_field_candidates
     where job_id = ? and status = 'pending'
     order by created_at asc, id asc`
  ).all(jobId) as Array<{
    candidateId: string
    fieldKey: string
    confidence: number
  }>
}

async function defaultModelCaller(input: {
  job: ExecutionJobRow
  requestEnvelope: Record<string, unknown>
}) {
  if (process.env.FORGETME_E2E_RUNNER_PROFILE_FIXTURE === '1') {
    const receivedAt = new Date().toISOString()

    return {
      provider: input.job.provider,
      model: input.job.model,
      usage: { fixture: true },
      receivedAt,
      payload: {
        choices: [{
          message: {
            content: JSON.stringify({
              documentType: 'transcript',
              rawText: '学校 北京大学',
              layoutBlocks: [{ page: 1, text: '学校 北京大学' }],
              fields: {
                school_name: '北京大学'
              }
            })
          }
        }]
      }
    }
  }

  const route = resolveModelRoute({
    taskType: input.job.enhancerType,
    preferredProvider: input.job.provider === 'openrouter' ? 'openrouter' : 'siliconflow'
  })

  return callLiteLLM({
    route: {
      ...route,
      model: input.job.model
    },
    messages: [
      {
        role: 'system',
        content: 'Return JSON only. Extract structured evidence from the provided sanitized local archive reference.'
      },
      {
        role: 'user',
        content: JSON.stringify(input.requestEnvelope)
      }
    ],
    responseFormat: { type: 'json_object' }
  })
}

export async function executeEnrichmentJob(db: ArchiveDatabase, input: {
  jobId: string
  callModel?: (input: { job: ExecutionJobRow; requestEnvelope: Record<string, unknown> }) => Promise<ModelCallResult>
}) {
  const job = getExecutionJob(db, input.jobId)
  const callModel = input.callModel ?? defaultModelCaller
  const boundary = buildProviderBoundaryRequest({ job })
  const requestStartedAt = new Date().toISOString()
  const artifactId = persistProviderEgressRequest(db, {
    job: boundary.job,
    policyKey: boundary.policyKey,
    requestEnvelope: boundary.requestEnvelope,
    redactionSummary: boundary.redactionSummary,
    createdAt: requestStartedAt
  })

  try {
    const modelResult = await callModel({
      job,
      requestEnvelope: boundary.requestEnvelope
    })
    persistProviderEgressResponse(db, {
      artifactId,
      payload: modelResult.payload,
      createdAt: modelResult.receivedAt || new Date().toISOString()
    })

    const extractionPayload = parseExtractionPayload(modelResult.payload)

    if (job.enhancerType === 'document_ocr') {
      const extraction = normalizeDocumentExtraction({
        documentType: typeof extractionPayload.documentType === 'string' ? extractionPayload.documentType : 'generic_document',
        rawText: typeof extractionPayload.rawText === 'string' ? extractionPayload.rawText : '',
        layoutBlocks: Array.isArray(extractionPayload.layoutBlocks)
          ? extractionPayload.layoutBlocks.filter((entry): entry is { page: number; text: string; bbox?: number[] } => (
              !!entry
              && typeof entry === 'object'
              && typeof (entry as { page?: unknown }).page === 'number'
              && typeof (entry as { text?: unknown }).text === 'string'
            ))
          : [],
        fields: extractionPayload.fields && typeof extractionPayload.fields === 'object'
          ? extractionPayload.fields as Record<string, string | null | undefined>
          : {}
      })

      persistDocumentExtraction(db, {
        fileId: job.fileId,
        jobId: job.id,
        extraction
      })
    } else {
      const extraction = normalizeImageExtraction({
        imageType: typeof extractionPayload.imageType === 'string'
          ? extractionPayload.imageType
          : (job.enhancerType === 'chat_screenshot' ? 'chat_screenshot' : 'generic_image'),
        summary: typeof extractionPayload.summary === 'string' ? extractionPayload.summary : '',
        transcriptText: typeof extractionPayload.transcriptText === 'string'
          ? extractionPayload.transcriptText
          : (typeof extractionPayload.rawText === 'string' ? extractionPayload.rawText : ''),
        participantFragments: parseStringArray(extractionPayload.participantFragments),
        detectedDates: parseStringArray(extractionPayload.detectedDates),
        detectedLocations: parseStringArray(extractionPayload.detectedLocations)
      })

      persistImageExtraction(db, {
        fileId: job.fileId,
        jobId: job.id,
        extraction
      })
    }

    for (const candidate of loadPendingStructuredFieldCandidates(db, job.id)) {
      queueStructuredFieldCandidate(db, candidate)
    }

    const finishedAt = modelResult.receivedAt || new Date().toISOString()
    completeEnrichmentJob(db, {
      jobId: job.id,
      usage: modelResult.usage,
      finishedAt
    })

    return {
      status: 'completed' as const,
      jobId: job.id,
      fileId: job.fileId,
      enhancerType: job.enhancerType,
      provider: modelResult.provider,
      model: modelResult.model,
      usage: modelResult.usage,
      finishedAt
    }
  } catch (error) {
    const finishedAt = new Date().toISOString()
    const errorMessage = error instanceof Error ? error.message : 'Unknown enrichment execution failure'

    persistProviderEgressError(db, {
      artifactId,
      payload: {
        errorKind: error instanceof SyntaxError ? 'parse_error' : 'execution_error',
        errorMessage
      },
      createdAt: finishedAt
    })

    failEnrichmentJob(db, {
      jobId: job.id,
      errorMessage,
      finishedAt,
      errorKind: error instanceof SyntaxError ? 'parse_error' : 'execution_error'
    })

    return {
      status: 'failed' as const,
      jobId: job.id,
      fileId: job.fileId,
      enhancerType: job.enhancerType,
      errorMessage,
      finishedAt
    }
  }
}
