import { z } from 'zod'
import {
  canonicalPersonIdSchema,
  journalIdSchema,
  queueItemIdSchema,
  rejectReviewItemInputSchema
} from './common'

export {
  canonicalPersonIdSchema,
  journalIdSchema,
  queueItemIdSchema,
  rejectReviewItemInputSchema
}

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
