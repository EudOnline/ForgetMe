import { z } from 'zod'

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

export const askPersonAgentConsultationInputSchema = z.object({
  canonicalPersonId: z.string().min(1),
  question: z.string().min(1),
  sessionId: z.string().min(1).optional()
})

export const getPersonAgentStateInputSchema = z.object({
  canonicalPersonId: z.string().min(1)
})

export const getPersonAgentCapsuleInputSchema = z.object({
  capsuleId: z.string().min(1).optional(),
  personAgentId: z.string().min(1).optional(),
  canonicalPersonId: z.string().min(1).optional()
}).refine(
  (value) => Boolean(value.capsuleId || value.personAgentId || value.canonicalPersonId),
  { message: 'one person-agent capsule identifier is required' }
)

export const listPersonAgentCapsuleMemoryCheckpointsInputSchema = z.object({
  capsuleId: z.string().min(1).optional(),
  personAgentId: z.string().min(1).optional(),
  canonicalPersonId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(20).optional()
}).refine(
  (value) => Boolean(value.capsuleId || value.personAgentId || value.canonicalPersonId),
  { message: 'one person-agent capsule identifier is required' }
)

export const getPersonAgentMemorySummaryInputSchema = z.object({
  canonicalPersonId: z.string().min(1)
})

export const getPersonAgentInspectionBundleInputSchema = z.object({
  canonicalPersonId: z.string().min(1)
})

export const listPersonAgentConsultationSessionsInputSchema = z.object({
  personAgentId: z.string().min(1).optional(),
  canonicalPersonId: z.string().min(1).optional()
}).optional().default({})

export const getPersonAgentConsultationSessionInputSchema = z.object({
  sessionId: z.string().min(1)
})

export const getPersonAgentRuntimeStateInputSchema = z.object({
  canonicalPersonId: z.string().min(1)
})

export const listPersonAgentRefreshQueueInputSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional()
}).optional().default({})

export const listPersonAgentAuditEventsInputSchema = z.object({
  personAgentId: z.string().min(1).optional(),
  canonicalPersonId: z.string().min(1).optional(),
  eventKind: z.string().min(1).optional()
}).optional().default({})

export const listPersonAgentTasksInputSchema = z.object({
  personAgentId: z.string().min(1).optional(),
  canonicalPersonId: z.string().min(1).optional(),
  status: z.enum(['pending', 'processing', 'completed', 'dismissed']).optional()
}).optional().default({})

export const transitionPersonAgentTaskInputSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(['processing', 'completed', 'dismissed']),
  source: z.string().min(1).optional(),
  reason: z.string().min(1).optional()
})

export const listPersonAgentTaskRunsInputSchema = z.object({
  taskId: z.string().min(1).optional(),
  personAgentId: z.string().min(1).optional(),
  canonicalPersonId: z.string().min(1).optional(),
  taskKind: z.enum([
    'await_refresh',
    'resolve_conflict',
    'fill_coverage_gap',
    'expand_topic',
    'review_strategy_change'
  ]).optional(),
  runStatus: z.enum(['completed', 'blocked', 'failed']).optional()
}).optional().default({})

export const executePersonAgentTaskInputSchema = z.object({
  taskId: z.string().min(1),
  source: z.string().min(1).optional()
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

export const listApprovedPersonaDraftPublicationsInputSchema = approvedPersonaDraftReviewIdSchema

export const publishApprovedPersonaDraftInputSchema = approvedPersonaDraftReviewIdSchema.extend({
  destinationRoot: z.string().min(1)
})

export const listApprovedPersonaDraftHostedShareLinksInputSchema = approvedPersonaDraftReviewIdSchema

export const revokeApprovedPersonaDraftHostedShareLinkInputSchema = z.object({
  shareLinkId: z.string().min(1)
})

const hostedShareProtocolSchema = z.string().url().refine(
  (value) => {
    try {
      const parsedUrl = new URL(value)
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
    } catch {
      return false
    }
  },
  { message: 'shareUrl must use http or https protocol' }
)

export const openApprovedDraftHostedShareLinkInputSchema = z.object({
  shareUrl: hostedShareProtocolSchema
})

const absolutePathLikeSchema = z.string().min(1).refine(
  (value) => /^(?:[A-Za-z]:[\\/]|\/|\\\\[^\\/]+[\\/][^\\/]+)/.test(value),
  { message: 'entryPath must be an absolute path' }
)

export const openApprovedDraftPublicationEntryInputSchema = z.object({
  entryPath: absolutePathLikeSchema.refine(
    (value) => /[\\/]index\.html$/.test(value),
    { message: 'entryPath must target index.html' }
  )
})

export const approvedDraftSendDestinationIdSchema = z.string().min(1)
export const approvedDraftProviderSendArtifactIdSchema = z.string().min(1)

export const listApprovedPersonaDraftProviderSendsInputSchema = approvedPersonaDraftReviewIdSchema

export const sendApprovedPersonaDraftToProviderInputSchema = approvedPersonaDraftReviewIdSchema.extend({
  destinationId: approvedDraftSendDestinationIdSchema.optional()
})

export const retryApprovedPersonaDraftProviderSendInputSchema = z.object({
  artifactId: approvedDraftProviderSendArtifactIdSchema
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
