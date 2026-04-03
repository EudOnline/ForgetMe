import { z } from 'zod'
import { journalIdSchema, queueItemIdSchema, rejectReviewItemInputSchema } from './common'

export {
  journalIdSchema,
  queueItemIdSchema,
  rejectReviewItemInputSchema
}

export const reviewQueueListInputSchema = z.object({
  status: z.string().min(1).optional()
}).optional().default({})

export const decisionJournalFilterSchema = z.object({
  query: z.string().min(1).optional(),
  decisionType: z.string().min(1).optional(),
  targetType: z.string().min(1).optional()
}).optional().default({})

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

export const approveSafeReviewGroupInputSchema = z.object({
  groupKey: z.string().min(1)
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
