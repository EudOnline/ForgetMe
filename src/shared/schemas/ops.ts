import { z } from 'zod'
import {
  directoryPathSchema,
  jobIdSchema,
  journalIdSchema,
  queueItemIdSchema,
  rejectReviewItemInputSchema
} from './common'

export {
  directoryPathSchema,
  jobIdSchema,
  journalIdSchema,
  queueItemIdSchema,
  rejectReviewItemInputSchema
}

export const enrichmentJobFilterSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  fileId: z.string().min(1).optional()
}).optional().default({})

export const enrichmentAttemptFilterSchema = z.object({
  jobId: z.string().min(1).optional(),
  status: z.enum(['processing', 'completed', 'failed', 'cancelled']).optional()
}).optional().default({})

export const documentEvidenceInputSchema = z.object({
  fileId: z.string().min(1)
})

export const structuredFieldCandidateFilterSchema = z.object({
  fileId: z.string().min(1).optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'undone']).optional()
}).optional().default({})

export const backupExportInputSchema = z.object({
  destinationRoot: directoryPathSchema,
  encryptionPassword: z.string().min(1).optional()
})

export const restoreBackupInputSchema = z.object({
  exportRoot: directoryPathSchema,
  targetRoot: directoryPathSchema,
  overwrite: z.boolean().optional(),
  encryptionPassword: z.string().min(1).optional()
})
