import { z } from 'zod'

export const batchIdSchema = z.object({
  batchId: z.string().min(1)
})

export const fileIdSchema = z.object({
  fileId: z.string().min(1)
})

export const jobIdSchema = z.object({
  jobId: z.string().min(1)
})

export const journalIdSchema = z.object({
  journalId: z.string().min(1)
})

export const queueItemIdSchema = z.object({
  queueItemId: z.string().min(1)
})

export const canonicalPersonIdSchema = z.object({
  canonicalPersonId: z.string().min(1)
})

export const directoryPathSchema = z.string().min(1)

export const rejectReviewItemInputSchema = z.object({
  queueItemId: z.string().min(1),
  note: z.string().min(1).optional()
})
