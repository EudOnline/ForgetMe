import { z } from 'zod'
import type { AgentRole, AgentTaskKind } from './archiveContracts'

export const createImportBatchInputSchema = z.object({
  sourcePaths: z.array(z.string()).min(1),
  sourceLabel: z.string().min(1)
})

export const importPreflightInputSchema = z.object({
  sourcePaths: z.array(z.string()).min(1)
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

export const agentRoleSchema = z.enum([
  'orchestrator',
  'ingestion',
  'review',
  'workspace',
  'governance'
])

export const agentTaskKindSchema = z.enum([
  'orchestrator.plan_next_action',
  'ingestion.import_batch',
  'ingestion.rerun_enrichment',
  'ingestion.summarize_document_evidence',
  'review.summarize_queue',
  'review.suggest_safe_group_action',
  'review.apply_safe_group',
  'review.apply_item_decision',
  'workspace.ask_memory',
  'workspace.compare',
  'workspace.publish_draft',
  'governance.record_feedback',
  'governance.summarize_failures',
  'governance.propose_policy_update'
])

const agentRunStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled'
])

const agentSuggestionStatusSchema = z.enum([
  'suggested',
  'dismissed',
  'executed'
])

export const agentSuggestionPrioritySchema = z.enum([
  'low',
  'medium',
  'high',
  'critical'
])

export const agentRunExecutionOriginSchema = z.enum([
  'operator_manual',
  'operator_suggestion',
  'auto_runner'
])

export const agentAutonomyModeSchema = z.enum([
  'manual_only',
  'suggest_safe_auto_run'
])

const destructiveReviewTaskKinds: ReadonlySet<AgentTaskKind> = new Set([
  'review.apply_safe_group',
  'review.apply_item_decision'
])

const allowedTaskKindsByRole: Record<AgentRole, readonly AgentTaskKind[]> = {
  orchestrator: ['orchestrator.plan_next_action'],
  ingestion: [
    'ingestion.import_batch',
    'ingestion.rerun_enrichment',
    'ingestion.summarize_document_evidence'
  ],
  review: [
    'review.summarize_queue',
    'review.suggest_safe_group_action',
    'review.apply_safe_group',
    'review.apply_item_decision'
  ],
  workspace: [
    'workspace.ask_memory',
    'workspace.compare',
    'workspace.publish_draft'
  ],
  governance: [
    'governance.record_feedback',
    'governance.summarize_failures',
    'governance.propose_policy_update'
  ]
} as const

export const runAgentTaskInputSchema = z.object({
  prompt: z.string().min(1),
  role: agentRoleSchema,
  taskKind: agentTaskKindSchema.optional(),
  confirmationToken: z.string().min(1).optional()
}).superRefine((value, ctx) => {
  if (value.taskKind) {
    const allowedTaskKinds = allowedTaskKindsByRole[value.role]
    if (!allowedTaskKinds.includes(value.taskKind)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'taskKind is not allowed for the selected role',
        path: ['taskKind']
      })
    }
  }

  if (value.taskKind && destructiveReviewTaskKinds.has(value.taskKind) && !value.confirmationToken) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'confirmationToken is required for destructive review tasks',
      path: ['confirmationToken']
    })
  }
})

export const previewAgentTaskInputSchema = runAgentTaskInputSchema

export const listAgentRunsInputSchema = z.object({
  role: agentRoleSchema.optional(),
  status: agentRunStatusSchema.optional(),
  limit: z.number().int().positive().max(200).optional()
}).optional().default({})

export const getAgentRunInputSchema = z.object({
  runId: z.string().min(1)
})

export const listAgentMemoriesInputSchema = z.object({
  role: agentRoleSchema.optional(),
  memoryKey: z.string().min(1).optional()
}).optional().default({})

export const listAgentPolicyVersionsInputSchema = z.object({
  role: agentRoleSchema.optional(),
  policyKey: z.string().min(1).optional()
}).optional().default({})

export const listAgentSuggestionsInputSchema = z.object({
  status: agentSuggestionStatusSchema.optional(),
  role: agentRoleSchema.optional(),
  limit: z.number().int().positive().max(200).optional()
}).optional().default({})

export const refreshAgentSuggestionsInputSchema = z.undefined().optional()

export const dismissAgentSuggestionInputSchema = z.object({
  suggestionId: z.string().min(1)
})

export const runAgentSuggestionInputSchema = z.object({
  suggestionId: z.string().min(1),
  confirmationToken: z.string().min(1).optional()
})

export const getAgentRuntimeSettingsInputSchema = z.object({}).optional().default({})

export const updateAgentRuntimeSettingsInputSchema = z.object({
  autonomyMode: agentAutonomyModeSchema
})

export const agentObjectiveKindSchema = z.enum([
  'review_decision',
  'evidence_investigation',
  'user_response',
  'policy_change',
  'publication'
])

export const agentObjectiveStatusSchema = z.enum([
  'open',
  'in_progress',
  'awaiting_operator',
  'blocked',
  'stalled',
  'completed',
  'cancelled'
])

export const agentObjectiveInitiatorSchema = z.enum([
  'operator',
  'system',
  'proposal_followup'
])

export const agentObjectiveRiskLevelSchema = z.enum([
  'low',
  'medium',
  'high',
  'critical'
])

export const agentProposalKindSchema = z.enum([
  'approve_review_item',
  'reject_review_item',
  'approve_safe_group',
  'rerun_enrichment',
  'ask_memory_workspace',
  'run_compare',
  'spawn_subagent',
  'search_web',
  'verify_external_claim',
  'compose_reviewed_draft',
  'publish_draft',
  'create_policy_draft',
  'respond_to_user'
])

export const agentCheckpointKindSchema = z.enum([
  'goal_accepted',
  'participants_invited',
  'evidence_gap_detected',
  'subagent_spawned',
  'tool_action_executed',
  'external_verification_completed',
  'proposal_raised',
  'challenge_raised',
  'veto_issued',
  'consensus_reached',
  'awaiting_operator_confirmation',
  'committed',
  'blocked',
  'user_facing_result_prepared'
])

export const agentSkillPackIdSchema = z.enum([
  'web-verifier',
  'evidence-checker',
  'policy-auditor',
  'draft-composer',
  'compare-analyst'
])

export const agentArtifactRefSchema = z.object({
  kind: z.enum([
    'review_queue_item',
    'review_group',
    'file',
    'enrichment_job',
    'workspace_turn',
    'compare_session',
    'policy_version',
    'memory_record',
    'external_citation_bundle'
  ]),
  id: z.string().min(1),
  label: z.string().min(1)
})

export const agentExecutionBudgetSchema = z.object({
  maxRounds: z.number().int().positive(),
  maxToolCalls: z.number().int().positive(),
  timeoutMs: z.number().int().positive()
})

export const createAgentObjectiveInputSchema = z.object({
  title: z.string().min(1),
  objectiveKind: agentObjectiveKindSchema,
  prompt: z.string().min(1),
  initiatedBy: agentObjectiveInitiatorSchema.optional(),
  ownerRole: agentRoleSchema.optional(),
  initialParticipants: z.array(agentRoleSchema).min(1).optional(),
  riskLevel: agentObjectiveRiskLevelSchema.optional(),
  budget: agentExecutionBudgetSchema.optional()
})

export const listAgentObjectivesInputSchema = z.object({
  status: agentObjectiveStatusSchema.optional(),
  ownerRole: agentRoleSchema.optional(),
  limit: z.number().int().positive().max(200).optional()
}).optional().default({})

export const getAgentObjectiveInputSchema = z.object({
  objectiveId: z.string().min(1)
})

export const getAgentThreadInputSchema = z.object({
  threadId: z.string().min(1)
})

const agentProposalBaseSchema = z.object({
  objectiveId: z.string().min(1),
  threadId: z.string().min(1),
  ownerRole: agentRoleSchema,
  requiredApprovals: z.array(agentRoleSchema).min(1).optional(),
  allowVetoBy: z.array(agentRoleSchema).min(1).optional(),
  requiresOperatorConfirmation: z.boolean().optional(),
  derivedFromMessageIds: z.array(z.string().min(1)).optional(),
  artifactRefs: z.array(agentArtifactRefSchema).optional()
})

const genericProposalPayloadSchema = z.record(z.string(), z.unknown())

const genericAgentProposalInputSchema = agentProposalBaseSchema.extend({
  proposalKind: z.enum([
    'approve_review_item',
    'reject_review_item',
    'approve_safe_group',
    'rerun_enrichment',
    'ask_memory_workspace',
    'run_compare',
    'compose_reviewed_draft',
    'publish_draft',
    'create_policy_draft',
    'respond_to_user'
  ]),
  payload: genericProposalPayloadSchema,
  toolPolicyId: z.string().min(1).optional(),
  budget: agentExecutionBudgetSchema.optional()
})

const externalVerificationProposalInputSchema = agentProposalBaseSchema.extend({
  proposalKind: z.enum([
    'search_web',
    'verify_external_claim'
  ]),
  payload: genericProposalPayloadSchema,
  toolPolicyId: z.string().min(1),
  budget: agentExecutionBudgetSchema
})

const spawnSubagentProposalInputSchema = agentProposalBaseSchema.extend({
  proposalKind: z.literal('spawn_subagent'),
  payload: z.object({
    specialization: agentSkillPackIdSchema,
    skillPackIds: z.array(agentSkillPackIdSchema).min(1),
    expectedOutputSchema: z.string().min(1)
  }).passthrough(),
  toolPolicyId: z.string().min(1),
  budget: agentExecutionBudgetSchema
})

export const createAgentProposalInputSchema = z.union([
  genericAgentProposalInputSchema,
  externalVerificationProposalInputSchema,
  spawnSubagentProposalInputSchema
])

export const respondToAgentProposalInputSchema = z.object({
  proposalId: z.string().min(1),
  responderRole: agentRoleSchema,
  response: z.enum(['approve', 'challenge', 'reject', 'veto']),
  comment: z.string().min(1).optional(),
  artifactRefs: z.array(agentArtifactRefSchema).optional()
})

export const confirmAgentProposalInputSchema = z.object({
  proposalId: z.string().min(1),
  decision: z.enum(['confirm', 'block']),
  operatorNote: z.string().min(1).optional()
})

export const agentCheckpointSummarySchema = z.object({
  checkpointId: z.string().min(1),
  objectiveId: z.string().min(1),
  threadId: z.string().min(1),
  checkpointKind: agentCheckpointKindSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  relatedMessageId: z.string().min(1).nullable().optional(),
  relatedProposalId: z.string().min(1).nullable().optional(),
  artifactRefs: z.array(agentArtifactRefSchema).optional().default([]),
  createdAt: z.string().min(1)
})

export const agentCheckpointRecordSchema = agentCheckpointSummarySchema

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
