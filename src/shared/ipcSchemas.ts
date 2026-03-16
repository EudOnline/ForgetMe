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

export const memoryWorkspaceScopeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('global')
  }),
  z.object({
    kind: z.literal('person'),
    canonicalPersonId: z.string().min(1)
  }),
  z.object({
    kind: z.literal('group'),
    anchorPersonId: z.string().min(1)
  })
])

export const memoryWorkspaceWorkflowKindSchema = z.enum(['default', 'persona_draft_sandbox'])
export const memoryWorkspacePersonaDraftReviewStatusSchema = z.enum([
  'draft',
  'in_review',
  'approved',
  'rejected'
])

export const askMemoryWorkspaceInputSchema = z.object({
  scope: memoryWorkspaceScopeSchema,
  question: z.string().min(1),
  expressionMode: z.enum(['grounded', 'advice']).optional(),
  workflowKind: memoryWorkspaceWorkflowKindSchema.optional()
})

export const memoryWorkspaceCompareTargetSchema = z.discriminatedUnion('executionMode', [
  z.object({
    targetId: z.string().min(1),
    label: z.string().min(1),
    executionMode: z.literal('local_baseline')
  }),
  z.object({
    targetId: z.string().min(1),
    label: z.string().min(1),
    executionMode: z.literal('provider_model'),
    provider: z.enum(['siliconflow', 'openrouter']),
    model: z.string().min(1)
  })
])

export const runMemoryWorkspaceCompareInputSchema = z.object({
  scope: memoryWorkspaceScopeSchema,
  question: z.string().min(1),
  expressionMode: z.enum(['grounded', 'advice']).optional(),
  workflowKind: memoryWorkspaceWorkflowKindSchema.optional(),
  judge: z.object({
    enabled: z.boolean(),
    provider: z.enum(['siliconflow', 'openrouter']).optional(),
    model: z.string().min(1).optional()
  }).optional(),
  targets: z.array(memoryWorkspaceCompareTargetSchema).min(1).optional()
})

export const memoryWorkspaceCompareMatrixRowInputSchema = z.object({
  label: z.string().min(1).optional(),
  scope: memoryWorkspaceScopeSchema,
  question: z.string().min(1)
})

export const runMemoryWorkspaceCompareMatrixInputSchema = z.object({
  title: z.string().min(1).optional(),
  expressionMode: z.enum(['grounded', 'advice']).optional(),
  rows: z.array(memoryWorkspaceCompareMatrixRowInputSchema).min(1),
  judge: z.object({
    enabled: z.boolean(),
    provider: z.enum(['siliconflow', 'openrouter']).optional(),
    model: z.string().min(1).optional()
  }).optional(),
  targets: z.array(memoryWorkspaceCompareTargetSchema).min(1).optional()
})

export const memoryWorkspaceSessionFilterSchema = z.object({
  scope: memoryWorkspaceScopeSchema.optional()
}).optional().default({})

export const memoryWorkspaceSessionIdSchema = z.object({
  sessionId: z.string().min(1)
})

export const memoryWorkspaceCompareSessionFilterSchema = z.object({
  scope: memoryWorkspaceScopeSchema.optional()
}).optional().default({})

export const memoryWorkspaceCompareSessionIdSchema = z.object({
  compareSessionId: z.string().min(1)
})

export const memoryWorkspaceCompareMatrixIdSchema = z.object({
  matrixSessionId: z.string().min(1)
})

export const askMemoryWorkspacePersistedInputSchema = z.object({
  scope: memoryWorkspaceScopeSchema,
  question: z.string().min(1),
  expressionMode: z.enum(['grounded', 'advice']).optional(),
  workflowKind: memoryWorkspaceWorkflowKindSchema.optional(),
  sessionId: z.string().min(1).optional()
})

export const getPersonaDraftReviewByTurnInputSchema = z.object({
  turnId: z.string().min(1)
})

export const createPersonaDraftReviewFromTurnInputSchema = z.object({
  turnId: z.string().min(1)
})

export const updatePersonaDraftReviewInputSchema = z.object({
  draftReviewId: z.string().min(1),
  editedDraft: z.string().optional(),
  reviewNotes: z.string().optional()
})

export const transitionPersonaDraftReviewInputSchema = z.object({
  draftReviewId: z.string().min(1),
  status: memoryWorkspacePersonaDraftReviewStatusSchema
})

export const approvedPersonaDraftReviewIdSchema = z.object({
  draftReviewId: z.string().min(1)
})

export const listApprovedPersonaDraftHandoffsInputSchema = approvedPersonaDraftReviewIdSchema

export const exportApprovedPersonaDraftInputSchema = approvedPersonaDraftReviewIdSchema.extend({
  destinationRoot: z.string().min(1)
})

export const contextPackExportModeSchema = z.enum([
  'approved_only',
  'approved_plus_derived'
])

export const contextPackDestinationSchema = z.object({
  destinationRoot: z.string().min(1)
})

export const personContextPackInputSchema = z.object({
  canonicalPersonId: z.string().min(1),
  mode: contextPackExportModeSchema.optional()
})

export const groupContextPackInputSchema = z.object({
  anchorPersonId: z.string().min(1),
  mode: contextPackExportModeSchema.optional()
})

export const personContextPackExportInputSchema = personContextPackInputSchema.extend({
  destinationRoot: z.string().min(1)
})

export const groupContextPackExportInputSchema = groupContextPackInputSchema.extend({
  destinationRoot: z.string().min(1)
})

export const reviewQueueListInputSchema = z.object({
  status: z.string().min(1).optional()
}).optional().default({})

export const decisionJournalFilterSchema = z.object({
  query: z.string().min(1).optional(),
  decisionType: z.string().min(1).optional(),
  targetType: z.string().min(1).optional()
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

export const directoryPathSchema = z.string().min(1)

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

export const journalIdSchema = z.object({
  journalId: z.string().min(1)
})
