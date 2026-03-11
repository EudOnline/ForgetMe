import { z } from 'zod'

export const createImportBatchInputSchema = z.object({
  sourcePaths: z.array(z.string()).min(1),
  sourceLabel: z.string().min(1)
})

export const batchIdSchema = z.object({
  batchId: z.string().min(1)
})

export const fileIdSchema = z.object({
  fileId: z.string().min(1)
})

export const jobIdSchema = z.object({
  jobId: z.string().min(1)
})

export const canonicalPersonIdSchema = z.object({
  canonicalPersonId: z.string().min(1)
})

export const reviewQueueListInputSchema = z.object({
  status: z.string().min(1).optional()
}).optional().default({})

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

export const personProfileAttributeFilterSchema = z.object({
  canonicalPersonId: z.string().min(1).optional(),
  status: z.enum(['active', 'superseded', 'undone']).optional()
}).optional().default({})

export const profileAttributeCandidateFilterSchema = z.object({
  canonicalPersonId: z.string().min(1).optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'undone']).optional()
}).optional().default({})

export const relationshipLabelInputSchema = z.object({
  fromPersonId: z.string().min(1),
  toPersonId: z.string().min(1),
  label: z.string().min(1)
})

export const rejectReviewItemInputSchema = z.object({
  queueItemId: z.string().min(1),
  note: z.string().min(1).optional()
})

export const reviewActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    queueItemId: z.string().min(1)
  }),
  z.object({
    action: z.literal('reject'),
    queueItemId: z.string().min(1),
    note: z.string().min(1).optional()
  }),
  z.object({
    action: z.literal('undo'),
    journalId: z.string().min(1)
  })
])

export const queueItemIdSchema = z.object({
  queueItemId: z.string().min(1)
})

const reviewWorkbenchItemTypeSchema = z.enum(['structured_field_candidate', 'profile_attribute_candidate'])
const reviewWorkbenchStatusSchema = z.enum(['pending', 'approved', 'rejected', 'undone'])

export const reviewWorkbenchItemSchema = z.object({
  queueItemId: z.string().min(1)
})

export const reviewWorkbenchFilterSchema = z.object({
  itemType: reviewWorkbenchItemTypeSchema.optional(),
  status: reviewWorkbenchStatusSchema.optional(),
  canonicalPersonId: z.string().min(1).optional(),
  fieldKey: z.string().min(1).optional(),
  hasConflict: z.boolean().optional()
}).optional().default({})

export const journalIdSchema = z.object({
  journalId: z.string().min(1)
})
