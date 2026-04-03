import { z } from 'zod'

export const agentRoleSchema = z.enum([
  'ingestion',
  'review',
  'workspace',
  'governance'
])

export const agentTaskKindSchema = z.enum([
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

export const listAgentMemoriesInputSchema = z.object({
  role: agentRoleSchema.optional(),
  memoryKey: z.string().min(1).optional()
}).optional().default({})

export const listAgentPolicyVersionsInputSchema = z.object({
  role: agentRoleSchema.optional(),
  policyKey: z.string().min(1).optional()
}).optional().default({})

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
  'system'
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
  'adopt_compare_recommendation',
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
  'stalled',
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
    'adopt_compare_recommendation',
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
