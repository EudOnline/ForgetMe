import type {
  AgentObjectiveStatus,
} from '../../shared/objectiveRuntimeContracts'
import type { AgentRole } from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import type {
  AgentCheckpointRow,
  AgentMessageV2Row,
  AgentObjectiveRow,
  AgentProposalRow,
  AgentSubagentRow,
  AgentThreadParticipantRow,
  AgentThreadRow,
  AgentToolExecutionRow,
  AgentVoteRow
} from './objectivePersistenceRowMapperService'

export {
  mapCheckpointRow,
  mapMessageRow,
  mapObjectiveRow,
  mapProposalRow,
  mapSubagentRow,
  mapThreadParticipantRow,
  mapThreadRow,
  mapToolExecutionRow,
  mapVoteRow
} from './objectivePersistenceRowMapperService'

export function getObjectiveRow(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      title,
      objective_kind as objectiveKind,
      status,
      prompt,
      initiated_by as initiatedBy,
      owner_role as ownerRole,
      main_thread_id as mainThreadId,
      risk_level as riskLevel,
      budget_json as budgetJson,
      requires_operator_input as requiresOperatorInput,
      (
        select count(*)
        from agent_checkpoints checkpoints
        where checkpoints.objective_id = agent_objectives.id
          and checkpoints.checkpoint_kind = 'awaiting_operator_confirmation'
      ) as awaitingOperatorCount,
      (
        select count(*)
        from agent_checkpoints checkpoints
        where checkpoints.objective_id = agent_objectives.id
          and checkpoints.checkpoint_kind in ('blocked', 'veto_issued')
      ) as blockedCount,
      (
        select count(*)
        from agent_checkpoints checkpoints
        where checkpoints.objective_id = agent_objectives.id
          and checkpoints.checkpoint_kind = 'veto_issued'
      ) as vetoedCount,
      (
        select count(*)
        from agent_proposals proposals
        where proposals.objective_id = agent_objectives.id
          and proposals.proposal_risk_level = 'critical'
      ) as criticalProposalCount,
      (
        select
          'Blocked by ' || votes.voter_role || ': '
          || coalesce(votes.comment, 'No rationale provided.')
        from agent_votes votes
        where votes.objective_id = agent_objectives.id
          and votes.vote in ('veto', 'reject')
        order by votes.created_at desc, votes.id desc
        limit 1
      ) as latestBlocker,
      created_at as createdAt,
      updated_at as updatedAt
    from agent_objectives
    where id = ?`
  ).get(objectiveId) as AgentObjectiveRow | undefined
}

export function getThreadRow(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      parent_thread_id as parentThreadId,
      thread_kind as threadKind,
      owner_role as ownerRole,
      title,
      status,
      created_at as createdAt,
      updated_at as updatedAt,
      closed_at as closedAt
    from agent_threads
    where id = ?`
  ).get(threadId) as AgentThreadRow | undefined
}

export function listObjectiveRows(db: ArchiveDatabase, input?: {
  status?: AgentObjectiveStatus
  ownerRole?: AgentRole
  limit?: number
}) {
  return db.prepare(
    `select
      id,
      title,
      objective_kind as objectiveKind,
      status,
      prompt,
      initiated_by as initiatedBy,
      owner_role as ownerRole,
      main_thread_id as mainThreadId,
      risk_level as riskLevel,
      budget_json as budgetJson,
      requires_operator_input as requiresOperatorInput,
      (
        select count(*)
        from agent_checkpoints checkpoints
        where checkpoints.objective_id = agent_objectives.id
          and checkpoints.checkpoint_kind = 'awaiting_operator_confirmation'
      ) as awaitingOperatorCount,
      (
        select count(*)
        from agent_checkpoints checkpoints
        where checkpoints.objective_id = agent_objectives.id
          and checkpoints.checkpoint_kind in ('blocked', 'veto_issued')
      ) as blockedCount,
      (
        select count(*)
        from agent_checkpoints checkpoints
        where checkpoints.objective_id = agent_objectives.id
          and checkpoints.checkpoint_kind = 'veto_issued'
      ) as vetoedCount,
      (
        select count(*)
        from agent_proposals proposals
        where proposals.objective_id = agent_objectives.id
          and proposals.proposal_risk_level = 'critical'
      ) as criticalProposalCount,
      (
        select
          'Blocked by ' || votes.voter_role || ': '
          || coalesce(votes.comment, 'No rationale provided.')
        from agent_votes votes
        where votes.objective_id = agent_objectives.id
          and votes.vote in ('veto', 'reject')
        order by votes.created_at desc, votes.id desc
        limit 1
      ) as latestBlocker,
      created_at as createdAt,
      updated_at as updatedAt
    from agent_objectives
    where (? is null or status = ?)
      and (? is null or owner_role = ?)
    order by created_at desc, id desc
    limit ?`
  ).all(
    input?.status ?? null,
    input?.status ?? null,
    input?.ownerRole ?? null,
    input?.ownerRole ?? null,
    input?.limit ?? 200
  ) as AgentObjectiveRow[]
}

export function getMessageRow(db: ArchiveDatabase, messageId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      from_participant_id as fromParticipantId,
      to_participant_id as toParticipantId,
      kind,
      body,
      refs_json as refsJson,
      reply_to_message_id as replyToMessageId,
      round,
      confidence,
      blocking,
      created_at as createdAt
    from agent_messages_v2
    where id = ?`
  ).get(messageId) as AgentMessageV2Row | undefined
}

export function getProposalRow(db: ArchiveDatabase, proposalId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposed_by as proposedBy,
      proposal_kind as proposalKind,
      payload_json as payloadJson,
      owner_role as ownerRole,
      status,
      required_approvals_json as requiredApprovalsJson,
      allow_veto_by_json as allowVetoByJson,
      proposal_risk_level as proposalRiskLevel,
      autonomy_decision as autonomyDecision,
      risk_reasons_json as riskReasonsJson,
      confidence_score as confidenceScore,
      requires_operator_confirmation as requiresOperatorConfirmation,
      tool_policy_id as toolPolicyId,
      budget_json as budgetJson,
      derived_from_message_ids_json as derivedFromMessageIdsJson,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt,
      updated_at as updatedAt,
      committed_at as committedAt
    from agent_proposals
    where id = ?`
  ).get(proposalId) as AgentProposalRow | undefined
}

export function getVoteRow(db: ArchiveDatabase, voteId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposal_id as proposalId,
      voter_role as voterRole,
      vote,
      comment,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt
    from agent_votes
    where id = ?`
  ).get(voteId) as AgentVoteRow | undefined
}

export function getCheckpointRow(db: ArchiveDatabase, checkpointId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      checkpoint_kind as checkpointKind,
      title,
      summary,
      related_message_id as relatedMessageId,
      related_proposal_id as relatedProposalId,
      artifact_refs_json as artifactRefsJson,
      metadata_json as metadataJson,
      created_at as createdAt
    from agent_checkpoints
    where id = ?`
  ).get(checkpointId) as AgentCheckpointRow | undefined
}

export function getToolExecutionRow(db: ArchiveDatabase, toolExecutionId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposal_id as proposalId,
      requested_by_participant_id as requestedByParticipantId,
      tool_name as toolName,
      tool_policy_id as toolPolicyId,
      status,
      input_payload_json as inputPayloadJson,
      output_payload_json as outputPayloadJson,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt,
      completed_at as completedAt
    from agent_tool_executions
    where id = ?`
  ).get(toolExecutionId) as AgentToolExecutionRow | undefined
}

export function getSubagentRow(db: ArchiveDatabase, subagentId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      parent_thread_id as parentThreadId,
      parent_agent_role as parentAgentRole,
      specialization,
      skill_pack_ids_json as skillPackIdsJson,
      tool_policy_id as toolPolicyId,
      budget_json as budgetJson,
      expected_output_schema as expectedOutputSchema,
      status,
      summary,
      created_at as createdAt,
      completed_at as completedAt
    from agent_subagents
    where id = ?`
  ).get(subagentId) as AgentSubagentRow | undefined
}

export function listThreadRowsForObjective(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      parent_thread_id as parentThreadId,
      thread_kind as threadKind,
      owner_role as ownerRole,
      title,
      status,
      created_at as createdAt,
      updated_at as updatedAt,
      closed_at as closedAt
    from agent_threads
    where objective_id = ?
    order by created_at asc, id asc`
  ).all(objectiveId) as AgentThreadRow[]
}

export function listThreadParticipantRows(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      participant_kind as participantKind,
      participant_id as participantId,
      role,
      display_label as displayLabel,
      invited_by_participant_id as invitedByParticipantId,
      joined_at as joinedAt,
      left_at as leftAt
     from agent_thread_participants
     where thread_id = ?
     order by joined_at asc, rowid asc`
  ).all(threadId) as AgentThreadParticipantRow[]
}

export function listParticipantRowsForObjective(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      participant_kind as participantKind,
      participant_id as participantId,
      role,
      display_label as displayLabel,
      invited_by_participant_id as invitedByParticipantId,
      joined_at as joinedAt,
      left_at as leftAt
     from agent_thread_participants
     where objective_id = ?
     order by joined_at asc, rowid asc`
  ).all(objectiveId) as AgentThreadParticipantRow[]
}

export function listMessageRows(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      from_participant_id as fromParticipantId,
      to_participant_id as toParticipantId,
      kind,
      body,
      refs_json as refsJson,
      reply_to_message_id as replyToMessageId,
      round,
      confidence,
      blocking,
      created_at as createdAt
    from agent_messages_v2
    where thread_id = ?
    order by round asc, created_at asc, id asc`
  ).all(threadId) as AgentMessageV2Row[]
}

export function listProposalRowsByObjective(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposed_by as proposedBy,
      proposal_kind as proposalKind,
      payload_json as payloadJson,
      owner_role as ownerRole,
      status,
      required_approvals_json as requiredApprovalsJson,
      allow_veto_by_json as allowVetoByJson,
      proposal_risk_level as proposalRiskLevel,
      autonomy_decision as autonomyDecision,
      risk_reasons_json as riskReasonsJson,
      confidence_score as confidenceScore,
      requires_operator_confirmation as requiresOperatorConfirmation,
      tool_policy_id as toolPolicyId,
      budget_json as budgetJson,
      derived_from_message_ids_json as derivedFromMessageIdsJson,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt,
      updated_at as updatedAt,
      committed_at as committedAt
    from agent_proposals
    where objective_id = ?
    order by created_at asc, id asc`
  ).all(objectiveId) as AgentProposalRow[]
}

export function listProposalRowsByThread(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposed_by as proposedBy,
      proposal_kind as proposalKind,
      payload_json as payloadJson,
      owner_role as ownerRole,
      status,
      required_approvals_json as requiredApprovalsJson,
      allow_veto_by_json as allowVetoByJson,
      proposal_risk_level as proposalRiskLevel,
      autonomy_decision as autonomyDecision,
      risk_reasons_json as riskReasonsJson,
      confidence_score as confidenceScore,
      requires_operator_confirmation as requiresOperatorConfirmation,
      tool_policy_id as toolPolicyId,
      budget_json as budgetJson,
      derived_from_message_ids_json as derivedFromMessageIdsJson,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt,
      updated_at as updatedAt,
      committed_at as committedAt
    from agent_proposals
    where thread_id = ?
    order by created_at asc, id asc`
  ).all(threadId) as AgentProposalRow[]
}

export function listVoteRows(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposal_id as proposalId,
      voter_role as voterRole,
      vote,
      comment,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt
    from agent_votes
    where thread_id = ?
    order by created_at asc, id asc`
  ).all(threadId) as AgentVoteRow[]
}

export function listCheckpointRowsByObjective(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      checkpoint_kind as checkpointKind,
      title,
      summary,
      related_message_id as relatedMessageId,
      related_proposal_id as relatedProposalId,
      artifact_refs_json as artifactRefsJson,
      metadata_json as metadataJson,
      created_at as createdAt
    from agent_checkpoints
    where objective_id = ?
    order by created_at asc, id asc`
  ).all(objectiveId) as AgentCheckpointRow[]
}

export function listCheckpointRowsByThread(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      checkpoint_kind as checkpointKind,
      title,
      summary,
      related_message_id as relatedMessageId,
      related_proposal_id as relatedProposalId,
      artifact_refs_json as artifactRefsJson,
      metadata_json as metadataJson,
      created_at as createdAt
    from agent_checkpoints
    where thread_id = ?
    order by created_at asc, id asc`
  ).all(threadId) as AgentCheckpointRow[]
}

export function listSubagentRowsByObjective(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      parent_thread_id as parentThreadId,
      parent_agent_role as parentAgentRole,
      specialization,
      skill_pack_ids_json as skillPackIdsJson,
      tool_policy_id as toolPolicyId,
      budget_json as budgetJson,
      expected_output_schema as expectedOutputSchema,
      status,
      summary,
      created_at as createdAt,
      completed_at as completedAt
    from agent_subagents
    where objective_id = ?
    order by created_at asc, id asc`
  ).all(objectiveId) as AgentSubagentRow[]
}

export function listSubagentRowsByThread(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      parent_thread_id as parentThreadId,
      parent_agent_role as parentAgentRole,
      specialization,
      skill_pack_ids_json as skillPackIdsJson,
      tool_policy_id as toolPolicyId,
      budget_json as budgetJson,
      expected_output_schema as expectedOutputSchema,
      status,
      summary,
      created_at as createdAt,
      completed_at as completedAt
    from agent_subagents
    where thread_id = ?
    order by created_at asc, id asc`
  ).all(threadId) as AgentSubagentRow[]
}

export function listToolExecutionRowsByObjective(db: ArchiveDatabase, objectiveId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposal_id as proposalId,
      requested_by_participant_id as requestedByParticipantId,
      tool_name as toolName,
      tool_policy_id as toolPolicyId,
      status,
      input_payload_json as inputPayloadJson,
      output_payload_json as outputPayloadJson,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt,
      completed_at as completedAt
    from agent_tool_executions
    where objective_id = ?
    order by created_at asc, id asc`
  ).all(objectiveId) as AgentToolExecutionRow[]
}

export function listToolExecutionRowsByThread(db: ArchiveDatabase, threadId: string) {
  return db.prepare(
    `select
      id,
      objective_id as objectiveId,
      thread_id as threadId,
      proposal_id as proposalId,
      requested_by_participant_id as requestedByParticipantId,
      tool_name as toolName,
      tool_policy_id as toolPolicyId,
      status,
      input_payload_json as inputPayloadJson,
      output_payload_json as outputPayloadJson,
      artifact_refs_json as artifactRefsJson,
      created_at as createdAt,
      completed_at as completedAt
    from agent_tool_executions
    where thread_id = ?
    order by created_at asc, id asc`
  ).all(threadId) as AgentToolExecutionRow[]
}
