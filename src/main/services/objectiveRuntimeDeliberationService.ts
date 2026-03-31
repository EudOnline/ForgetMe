import type { createSubagentRegistryService } from './subagentRegistryService'
import {
  getObjectiveDetail,
  getThreadDetail,
  type CreateProposalInput
} from './objectivePersistenceService'
import type { createRoleAgentRegistryService } from './agents/roleAgentRegistryService'
import type {
  AgentArtifactRef,
  AgentMessageKind,
  AgentObjectiveDetail,
  AgentRole,
  AgentThreadDetail
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'

type SubagentRegistryService = ReturnType<typeof createSubagentRegistryService>
type RoleAgentRegistryService = ReturnType<typeof createRoleAgentRegistryService>

type AppendRuntimeMessage = (input: {
  objectiveId: string
  threadId: string
  fromParticipantId: string
  toParticipantId?: string | null
  kind: AgentMessageKind
  body: string
  refs?: AgentArtifactRef[]
  blocking?: boolean
  confidence?: number | null
}) => unknown

export function createObjectiveRuntimeDeliberationService(dependencies: {
  db: ArchiveDatabase
  roleAgentRegistry?: RoleAgentRegistryService | null
  subagentRegistry: SubagentRegistryService
  nextRound: (threadId: string) => number
  appendRuntimeMessage: AppendRuntimeMessage
  createProposalWithCheckpoint: (input: CreateProposalInput) => unknown
}) {
  const { db } = dependencies

  function stableJson(value: unknown) {
    return JSON.stringify(value)
  }

  function objectiveRecordFromDetail(detail: AgentObjectiveDetail) {
    return {
      objectiveId: detail.objectiveId,
      title: detail.title,
      objectiveKind: detail.objectiveKind,
      status: detail.status,
      prompt: detail.prompt,
      initiatedBy: detail.initiatedBy,
      ownerRole: detail.ownerRole,
      mainThreadId: detail.mainThreadId,
      riskLevel: detail.riskLevel,
      budget: detail.budget,
      requiresOperatorInput: detail.requiresOperatorInput,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt
    }
  }

  function hasEquivalentMessage(input: {
    thread: AgentThreadDetail
    fromParticipantId: string
    kind: AgentThreadDetail['messages'][number]['kind']
    body: string
    toParticipantId?: string | null
    blocking?: boolean
  }) {
    return input.thread.messages.some((message) => (
      message.fromParticipantId === input.fromParticipantId
      && message.toParticipantId === (input.toParticipantId ?? null)
      && message.kind === input.kind
      && message.body === input.body
      && message.blocking === Boolean(input.blocking)
    ))
  }

  function hasEquivalentProposal(input: {
    thread: AgentThreadDetail
    proposedByParticipantId: string
    proposalKind: CreateProposalInput['proposalKind']
    ownerRole: AgentRole
    payload: Record<string, unknown>
  }) {
    const payloadJson = stableJson(input.payload)

    return input.thread.proposals.some((proposal) => (
      proposal.proposedByParticipantId === input.proposedByParticipantId
      && proposal.proposalKind === input.proposalKind
      && proposal.ownerRole === input.ownerRole
      && stableJson(proposal.payload) === payloadJson
      && proposal.status !== 'blocked'
      && proposal.status !== 'superseded'
    ))
  }

  async function deliberateThread(input: {
    threadId: string
  }) {
    if (!dependencies.roleAgentRegistry) {
      const thread = getThreadDetail(db, { threadId: input.threadId })
      if (!thread) {
        throw new Error(`thread not found: ${input.threadId}`)
      }

      const objective = getObjectiveDetail(db, { objectiveId: thread.objectiveId })
      if (!objective) {
        throw new Error(`objective not found: ${thread.objectiveId}`)
      }

      return {
        objective,
        thread
      }
    }

    let thread = getThreadDetail(db, { threadId: input.threadId })
    if (!thread) {
      throw new Error(`thread not found: ${input.threadId}`)
    }

    let objective = getObjectiveDetail(db, { objectiveId: thread.objectiveId })
    if (!objective) {
      throw new Error(`objective not found: ${thread.objectiveId}`)
    }

    for (const participant of thread.participants) {
      if (participant.participantKind !== 'role' || participant.leftAt !== null || !participant.role) {
        continue
      }

      const adapter = dependencies.roleAgentRegistry.get(participant.role)
      if (!adapter?.receive) {
        continue
      }

      const receiveResult = await adapter.receive({
        db,
        objective: objectiveRecordFromDetail(objective),
        thread,
        participantId: participant.participantId,
        messages: thread.messages,
        proposals: thread.proposals,
        round: dependencies.nextRound(thread.threadId)
      })

      for (const messageDraft of receiveResult.messages) {
        if (hasEquivalentMessage({
          thread,
          fromParticipantId: participant.participantId,
          kind: messageDraft.kind,
          body: messageDraft.body,
          toParticipantId: messageDraft.toParticipantId,
          blocking: messageDraft.blocking
        })) {
          continue
        }

        dependencies.appendRuntimeMessage({
          objectiveId: objective.objectiveId,
          threadId: thread.threadId,
          fromParticipantId: participant.participantId,
          toParticipantId: messageDraft.toParticipantId,
          kind: messageDraft.kind,
          body: messageDraft.body,
          refs: messageDraft.refs,
          blocking: messageDraft.blocking,
          confidence: messageDraft.confidence
        })
      }

      thread = getThreadDetail(db, { threadId: input.threadId }) ?? thread
      objective = getObjectiveDetail(db, { objectiveId: thread.objectiveId }) ?? objective

      for (const proposalDraft of receiveResult.proposals ?? []) {
        if (hasEquivalentProposal({
          thread,
          proposedByParticipantId: participant.participantId,
          proposalKind: proposalDraft.proposalKind,
          ownerRole: proposalDraft.ownerRole,
          payload: proposalDraft.payload
        })) {
          continue
        }

        dependencies.createProposalWithCheckpoint({
          objectiveId: objective.objectiveId,
          threadId: thread.threadId,
          proposedByParticipantId: participant.participantId,
          proposalKind: proposalDraft.proposalKind,
          payload: proposalDraft.payload,
          ownerRole: proposalDraft.ownerRole,
          requiredApprovals: proposalDraft.requiredApprovals,
          allowVetoBy: proposalDraft.allowVetoBy,
          requiresOperatorConfirmation: proposalDraft.requiresOperatorConfirmation,
          toolPolicyId: proposalDraft.toolPolicyId,
          budget: proposalDraft.budget,
          artifactRefs: proposalDraft.artifactRefs,
          status: 'under_review'
        })
      }

      thread = getThreadDetail(db, { threadId: input.threadId }) ?? thread
      objective = getObjectiveDetail(db, { objectiveId: thread.objectiveId }) ?? objective

      for (const spawnRequest of receiveResult.spawnRequests ?? []) {
        const spawnSpec = dependencies.subagentRegistry.buildSpawnSubagentSpec({
          specialization: spawnRequest.specialization,
          payload: spawnRequest.payload
        })

        if (hasEquivalentProposal({
          thread,
          proposedByParticipantId: participant.participantId,
          proposalKind: 'spawn_subagent',
          ownerRole: spawnRequest.ownerRole,
          payload: spawnSpec.payload
        })) {
          continue
        }

        dependencies.createProposalWithCheckpoint({
          objectiveId: objective.objectiveId,
          threadId: thread.threadId,
          proposedByParticipantId: participant.participantId,
          proposalKind: 'spawn_subagent',
          payload: spawnSpec.payload,
          ownerRole: spawnRequest.ownerRole,
          requiredApprovals: spawnRequest.requiredApprovals,
          allowVetoBy: spawnRequest.allowVetoBy,
          requiresOperatorConfirmation: spawnRequest.requiresOperatorConfirmation,
          toolPolicyId: spawnRequest.toolPolicyId ?? spawnSpec.toolPolicyId,
          budget: spawnRequest.budget ?? spawnSpec.budget,
          artifactRefs: spawnRequest.artifactRefs,
          status: 'under_review'
        })

        thread = getThreadDetail(db, { threadId: input.threadId }) ?? thread
        objective = getObjectiveDetail(db, { objectiveId: thread.objectiveId }) ?? objective
      }

      thread = getThreadDetail(db, { threadId: input.threadId }) ?? thread
      objective = getObjectiveDetail(db, { objectiveId: thread.objectiveId }) ?? objective
    }

    return {
      objective,
      thread
    }
  }

  return {
    deliberateThread
  }
}
