import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import { resolveModelRoute, type ModelTaskType } from './modelGatewayService'

export type EnrichmentDispatchInput = {
  fileId: string
  fileName: string
  extension: string
}

export function chooseEnhancerType(input: { extension: string; fileName: string }) {
  const extension = input.extension.toLowerCase()
  const fileName = input.fileName.toLowerCase()

  if (['.jpg', '.jpeg', '.png', '.heic'].includes(extension)) {
    if (fileName.includes('screenshot') || fileName.includes('chat')) {
      return 'chat_screenshot' as const
    }

    return 'image_understanding' as const
  }

  if (['.pdf', '.docx'].includes(extension)) {
    return 'document_ocr' as const
  }

  return null
}

function enhancerToTaskType(enhancerType: ReturnType<typeof chooseEnhancerType>): ModelTaskType | null {
  if (!enhancerType) {
    return null
  }

  return enhancerType
}

export function enqueueEnrichmentJobs(db: ArchiveDatabase, files: EnrichmentDispatchInput[]) {
  const createdAt = new Date().toISOString()
  const findExistingJob = db.prepare(
    `select id from enrichment_jobs
     where file_id = ? and enhancer_type = ? and status in ('pending', 'processing', 'completed')
     limit 1`
  )
  const insertJob = db.prepare(
    `insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count,
      input_hash, started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const jobs = [] as Array<{
    id: string
    fileId: string
    enhancerType: NonNullable<ReturnType<typeof chooseEnhancerType>>
    provider: string
    model: string
    status: 'pending'
  }>

  for (const file of files) {
    const enhancerType = chooseEnhancerType(file)
    const taskType = enhancerToTaskType(enhancerType)
    if (!enhancerType || !taskType) {
      continue
    }

    const existingJob = findExistingJob.get(file.fileId, enhancerType) as { id: string } | undefined
    if (existingJob) {
      continue
    }

    const route = resolveModelRoute({ taskType })
    const jobId = crypto.randomUUID()

    insertJob.run(
      jobId,
      file.fileId,
      enhancerType,
      route.provider,
      route.model,
      'pending',
      0,
      null,
      null,
      null,
      null,
      '{}',
      createdAt,
      createdAt
    )

    jobs.push({
      id: jobId,
      fileId: file.fileId,
      enhancerType,
      provider: route.provider,
      model: route.model,
      status: 'pending'
    })
  }

  return jobs
}
