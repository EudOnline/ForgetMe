import type { AgentRole } from './archiveContracts'

export type AgentObjectiveKind =
  | 'review_decision'
  | 'evidence_investigation'
  | 'user_response'
  | 'policy_change'
  | 'publication'

export type AgentObjectiveStatus =
  | 'open'
  | 'in_progress'
  | 'awaiting_operator'
  | 'blocked'
  | 'stalled'
  | 'completed'
  | 'cancelled'

export type AgentObjectiveInitiator =
  | 'operator'
  | 'system'

export type AgentObjectiveRiskLevel =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

export type AgentThreadKind =
  | 'main'
  | 'subthread'

export type AgentThreadStatus =
  | 'open'
  | 'waiting'
  | 'completed'
  | 'blocked'
  | 'cancelled'

export type AgentParticipantKind =
  | 'role'
  | 'subagent'
  | 'operator'
  | 'broker'

export type AgentMessageKind =
  | 'goal'
  | 'stance'
  | 'question'
  | 'challenge'
  | 'proposal'
  | 'evidence_request'
  | 'evidence_response'
  | 'tool_request'
  | 'tool_result'
  | 'risk_notice'
  | 'vote'
  | 'veto'
  | 'decision'
  | 'final_response'

export type AgentProposalKind =
  | 'approve_review_item'
  | 'reject_review_item'
  | 'approve_safe_group'
  | 'adopt_compare_recommendation'
  | 'rerun_enrichment'
  | 'ask_memory_workspace'
  | 'run_compare'
  | 'spawn_subagent'
  | 'search_web'
  | 'verify_external_claim'
  | 'compose_reviewed_draft'
  | 'publish_draft'
  | 'create_policy_draft'
  | 'respond_to_user'

export type AgentProposalStatus =
  | 'open'
  | 'under_review'
  | 'challenged'
  | 'approved'
  | 'vetoed'
  | 'committable'
  | 'awaiting_operator'
  | 'committed'
  | 'blocked'
  | 'superseded'

export type AgentVoteValue =
  | 'approve'
  | 'challenge'
  | 'reject'
  | 'veto'

export type AgentCheckpointKind =
  | 'goal_accepted'
  | 'participants_invited'
  | 'evidence_gap_detected'
  | 'stalled'
  | 'subagent_spawned'
  | 'tool_action_executed'
  | 'external_verification_completed'
  | 'proposal_raised'
  | 'challenge_raised'
  | 'veto_issued'
  | 'consensus_reached'
  | 'awaiting_operator_confirmation'
  | 'committed'
  | 'blocked'
  | 'user_facing_result_prepared'

export type AgentSubagentStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AgentToolExecutionStatus =
  | 'requested'
  | 'authorized'
  | 'completed'
  | 'blocked'
  | 'failed'

export type AgentSkillPackId =
  | 'web-verifier'
  | 'evidence-checker'
  | 'policy-auditor'
  | 'draft-composer'
  | 'compare-analyst'

export type AgentArtifactRef = {
  kind:
    | 'review_queue_item'
    | 'review_group'
    | 'file'
    | 'enrichment_job'
    | 'workspace_turn'
    | 'compare_session'
    | 'policy_version'
    | 'memory_record'
    | 'external_citation_bundle'
  id: string
  label: string
}

export type AgentExecutionBudget = {
  maxRounds: number
  maxToolCalls: number
  timeoutMs: number
}

export type AgentObjectiveRecord = {
  objectiveId: string
  title: string
  objectiveKind: AgentObjectiveKind
  status: AgentObjectiveStatus
  prompt: string
  initiatedBy: AgentObjectiveInitiator
  ownerRole: AgentRole
  mainThreadId: string
  riskLevel: AgentObjectiveRiskLevel
  budget: AgentExecutionBudget | null
  requiresOperatorInput: boolean
  createdAt: string
  updatedAt: string
}

export type AgentThreadRecord = {
  threadId: string
  objectiveId: string
  parentThreadId: string | null
  threadKind: AgentThreadKind
  ownerRole: AgentRole
  title: string
  status: AgentThreadStatus
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export type AgentThreadParticipantRecord = {
  threadParticipantId: string
  objectiveId: string
  threadId: string
  participantKind: AgentParticipantKind
  participantId: string
  role: AgentRole | null
  displayLabel: string
  invitedByParticipantId: string | null
  joinedAt: string
  leftAt: string | null
}

export type AgentMessageRecordV2 = {
  messageId: string
  objectiveId: string
  threadId: string
  fromParticipantId: string
  toParticipantId: string | null
  kind: AgentMessageKind
  body: string
  refs: AgentArtifactRef[]
  replyToMessageId: string | null
  round: number
  confidence: number | null
  blocking: boolean
  createdAt: string
}

export type AgentProposalRecord = {
  proposalId: string
  objectiveId: string
  threadId: string
  proposedByParticipantId: string
  proposalKind: AgentProposalKind
  payload: Record<string, unknown>
  ownerRole: AgentRole
  status: AgentProposalStatus
  requiredApprovals: AgentRole[]
  allowVetoBy: AgentRole[]
  requiresOperatorConfirmation: boolean
  toolPolicyId: string | null
  budget: AgentExecutionBudget | null
  derivedFromMessageIds: string[]
  artifactRefs: AgentArtifactRef[]
  createdAt: string
  updatedAt: string
  committedAt: string | null
}

export type AgentVoteRecord = {
  voteId: string
  objectiveId: string
  threadId: string
  proposalId: string
  voterRole: AgentRole
  vote: AgentVoteValue
  comment: string | null
  createdAt: string
}

export type AgentCheckpointRecord = {
  checkpointId: string
  objectiveId: string
  threadId: string
  checkpointKind: AgentCheckpointKind
  title: string
  summary: string
  relatedMessageId: string | null
  relatedProposalId: string | null
  artifactRefs: AgentArtifactRef[]
  createdAt: string
}

export type AgentSubagentRecord = {
  subagentId: string
  objectiveId: string
  threadId: string
  parentThreadId: string
  parentAgentRole: AgentRole
  specialization: AgentSkillPackId
  skillPackIds: AgentSkillPackId[]
  toolPolicyId: string
  budget: AgentExecutionBudget
  expectedOutputSchema: string
  status: AgentSubagentStatus
  summary: string | null
  createdAt: string
  completedAt: string | null
}

export type AgentToolExecutionRecord = {
  toolExecutionId: string
  objectiveId: string
  threadId: string
  proposalId: string | null
  requestedByParticipantId: string
  toolName: string
  toolPolicyId: string | null
  status: AgentToolExecutionStatus
  inputPayload: Record<string, unknown>
  outputPayload: Record<string, unknown> | null
  artifactRefs: AgentArtifactRef[]
  createdAt: string
  completedAt: string | null
}

export type AgentObjectiveDetail = AgentObjectiveRecord & {
  threads: AgentThreadRecord[]
  participants: AgentThreadParticipantRecord[]
  proposals: AgentProposalRecord[]
  checkpoints: AgentCheckpointRecord[]
  subagents: AgentSubagentRecord[]
  toolExecutions?: AgentToolExecutionRecord[]
}

export type AgentThreadDetail = AgentThreadRecord & {
  participants: AgentThreadParticipantRecord[]
  messages: AgentMessageRecordV2[]
  proposals: AgentProposalRecord[]
  votes: AgentVoteRecord[]
  checkpoints: AgentCheckpointRecord[]
  subagents: AgentSubagentRecord[]
  toolExecutions?: AgentToolExecutionRecord[]
}

export type CreateAgentObjectiveInput = {
  title: string
  objectiveKind: AgentObjectiveKind
  prompt: string
  initiatedBy?: AgentObjectiveInitiator
  ownerRole?: AgentRole
  initialParticipants?: AgentRole[]
  riskLevel?: AgentObjectiveRiskLevel
  budget?: AgentExecutionBudget
}

export type ListAgentObjectivesInput = {
  status?: AgentObjectiveStatus
  ownerRole?: AgentRole
  limit?: number
}

export type GetAgentObjectiveInput = {
  objectiveId: string
}

export type GetAgentThreadInput = {
  threadId: string
}

export type CreateAgentProposalInput = {
  objectiveId: string
  threadId: string
  proposalKind: AgentProposalKind
  ownerRole: AgentRole
  payload: Record<string, unknown>
  requiredApprovals?: AgentRole[]
  allowVetoBy?: AgentRole[]
  requiresOperatorConfirmation?: boolean
  toolPolicyId?: string
  budget?: AgentExecutionBudget
  derivedFromMessageIds?: string[]
  artifactRefs?: AgentArtifactRef[]
}

export type RespondToAgentProposalInput = {
  proposalId: string
  responderRole: AgentRole
  response: AgentVoteValue
  comment?: string
  artifactRefs?: AgentArtifactRef[]
}

export type ConfirmAgentProposalInput = {
  proposalId: string
  decision: 'confirm' | 'block'
  operatorNote?: string
}
