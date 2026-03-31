import { evaluateProposalGate } from './agentProposalGateService'
import type { createSubagentRegistryService } from './subagentRegistryService'
import {
  getThreadDetail,
  recordProposalVote,
  type CreateProposalInput
} from './objectivePersistenceService'
import type {
  AgentArtifactRef,
  AgentMessageKind,
  AgentProposalRecord,
  AgentProposalStatus,
  AgentRole,
  AgentSkillPackId,
  AgentThreadDetail
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'

type SubagentRegistryService = ReturnType<typeof createSubagentRegistryService>

export type NestedSubagentExecutionResult = {
  subagent: {
    summary: string | null
  }
  subthread: {
    threadId: string
  }
}

export type RunnerSubagentDelegationResult = {
  proposal: AgentProposalRecord
  execution: NestedSubagentExecutionResult
  summary: string | null
  refs: AgentArtifactRef[]
  specialization: AgentSkillPackId
}

type ProposalRuntimeState = {
  proposal: AgentProposalRecord
  votes: AgentThreadDetail['votes']
  messages: AgentThreadDetail['messages']
}

type RuntimeHelpers = {
  appendRuntimeMessage: (input: {
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
  createProposalWithCheckpoint: (input: CreateProposalInput) => AgentProposalRecord
  loadProposalRuntimeState: (proposalId: string) => ProposalRuntimeState
  updateProposalFromGate: (input: {
    proposalId: string
    nextStatus: AgentProposalStatus
    messageId?: string
  }) => AgentProposalRecord
}

export function createObjectiveSubagentDelegationService(dependencies: {
  db: ArchiveDatabase
  subagentRegistry: SubagentRegistryService
  helpers: RuntimeHelpers
  executeCommittedSpawnSubagentProposal: (proposal: AgentProposalRecord) => Promise<unknown>
}) {
  const { db } = dependencies

  async function approveNestedSpawnSubagentProposal(input: {
    objectiveId: string
    threadId: string
    proposedByParticipantId: string
    ownerRole: AgentRole
    payload: Record<string, unknown>
    toolPolicyId: string
    budget: {
      maxRounds: number
      maxToolCalls: number
      timeoutMs: number
    }
    approvalComment: string
  }) {
    const proposal = dependencies.helpers.createProposalWithCheckpoint({
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      proposedByParticipantId: input.proposedByParticipantId,
      proposalKind: 'spawn_subagent',
      payload: input.payload,
      ownerRole: input.ownerRole,
      status: 'under_review',
      requiredApprovals: [input.ownerRole],
      allowVetoBy: ['governance'],
      requiresOperatorConfirmation: false,
      toolPolicyId: input.toolPolicyId,
      budget: input.budget
    })

    recordProposalVote(db, {
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      proposalId: proposal.proposalId,
      voterRole: input.ownerRole,
      vote: 'approve',
      comment: input.approvalComment
    })

    const runtimeState = dependencies.helpers.loadProposalRuntimeState(proposal.proposalId)
    const gate = evaluateProposalGate({
      proposal: runtimeState.proposal,
      votes: runtimeState.votes,
      messages: runtimeState.messages
    })

    const updated = dependencies.helpers.updateProposalFromGate({
      proposalId: proposal.proposalId,
      nextStatus: gate.status
    })

    if (updated.status !== 'committable' && updated.status !== 'committed') {
      throw new Error(`Nested spawn_subagent proposal did not become executable: ${updated.status}`)
    }

    const committed = updated.status === 'committed'
      ? updated
      : dependencies.helpers.updateProposalFromGate({
        proposalId: updated.proposalId,
        nextStatus: 'committed'
      })

    const execution = await dependencies.executeCommittedSpawnSubagentProposal(committed)

    return {
      proposal: committed,
      execution
    }
  }

  async function delegateSubagentFromRunner(input: {
    proposal: AgentProposalRecord
    parentSubthreadId: string
    requestedByParticipantId: string
    specialization: AgentSkillPackId
    payload: Record<string, unknown>
    approvalComment: string
  }): Promise<RunnerSubagentDelegationResult> {
    const spawnSpec = dependencies.subagentRegistry.buildSpawnSubagentSpec({
      specialization: input.specialization,
      payload: input.payload
    })

    if (!spawnSpec.toolPolicyId) {
      throw new Error(`Nested delegation requires a tool policy for ${input.specialization}`)
    }

    dependencies.helpers.appendRuntimeMessage({
      objectiveId: input.proposal.objectiveId,
      threadId: input.parentSubthreadId,
      fromParticipantId: input.requestedByParticipantId,
      kind: 'decision',
      body: `Nested delegation requested: ${input.specialization}.`
    })

    const nestedDelegation = await approveNestedSpawnSubagentProposal({
      objectiveId: input.proposal.objectiveId,
      threadId: input.parentSubthreadId,
      proposedByParticipantId: input.requestedByParticipantId,
      ownerRole: input.proposal.ownerRole,
      payload: spawnSpec.payload,
      toolPolicyId: spawnSpec.toolPolicyId,
      budget: spawnSpec.budget,
      approvalComment: input.approvalComment
    })

    const execution = nestedDelegation.execution as NestedSubagentExecutionResult | null
    if (!execution) {
      throw new Error(`Nested delegation execution missing for ${input.specialization}`)
    }

    const childThread = getThreadDetail(db, {
      threadId: execution.subthread.threadId
    })
    const finalResponse = childThread?.messages
      .slice()
      .reverse()
      .find((message) => message.kind === 'final_response')
    const refs = [...(finalResponse?.refs ?? [])]
    const summary = execution.subagent.summary ?? null

    dependencies.helpers.appendRuntimeMessage({
      objectiveId: input.proposal.objectiveId,
      threadId: input.parentSubthreadId,
      fromParticipantId: input.requestedByParticipantId,
      kind: 'tool_result',
      body: summary
        ? `Nested delegation completed: ${input.specialization}. Summary: ${summary}`
        : `Nested delegation completed: ${input.specialization}. No summary returned.`,
      refs
    })

    return {
      proposal: nestedDelegation.proposal,
      execution,
      summary,
      refs,
      specialization: input.specialization
    }
  }

  return {
    approveNestedSpawnSubagentProposal,
    delegateSubagentFromRunner
  }
}
