import { z } from 'zod'

export const createImportBatchInputSchema = z.object({
  sourcePaths: z.array(z.string()).min(1),
  sourceLabel: z.string().min(1)
})

export const batchIdSchema = z.object({
  batchId: z.string().min(1)
})

export const canonicalPersonIdSchema = z.object({
  canonicalPersonId: z.string().min(1)
})

export const reviewQueueListInputSchema = z.object({
  status: z.string().min(1).optional()
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

export const journalIdSchema = z.object({
  journalId: z.string().min(1)
})
