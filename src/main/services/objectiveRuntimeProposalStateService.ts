import { buildProposalCheckpoint } from './agentCheckpointService'
import { evaluateProposalGate } from './agentProposalGateService'
import { createObjectiveRuntimeConfigService } from './objectiveRuntimeConfigService'
import { createObjectiveRuntimeTelemetryService } from './objectiveRuntimeTelemetryService'
import { assessProposalRisk } from './proposalRiskAssessmentService'
import {
  createCheckpoint,
  createProposal,
  getProposal,
  getThreadDetail,
  updateProposalStatus,
  type CreateProposalInput
} from './objectivePersistenceService'
import type {
  AgentMessageKind,
  AgentProposalRecord,
  AgentProposalStatus,
  AgentThreadDetail
} from '../../shared/objectiveRuntimeContracts'
import type { ArchiveDatabase } from './db'

export type ObjectiveProposalRuntimeState = {
  proposal: AgentProposalRecord
  votes: AgentThreadDetail['votes']
  messages: AgentThreadDetail['messages']
}

export function createObjectiveRuntimeProposalStateService(dependencies: {
  db: ArchiveDatabase
  runtimeTelemetry?: ReturnType<typeof createObjectiveRuntimeTelemetryService>
  runtimeConfig?: ReturnType<typeof createObjectiveRuntimeConfigService>
}) {
  const { db } = dependencies
  const runtimeTelemetry = dependencies.runtimeTelemetry ?? createObjectiveRuntimeTelemetryService({ db })
  const runtimeConfig = dependencies.runtimeConfig ?? createObjectiveRuntimeConfigService({
    env: {}
  })

  function createProposalWithCheckpoint(input: CreateProposalInput) {
    const assessedRisk = assessProposalRisk({
      proposalKind: input.proposalKind,
      payload: input.payload,
      toolPolicyId: input.toolPolicyId,
      artifactRefs: input.artifactRefs ?? []
    })
    const proposalRiskLevel = input.proposalRiskLevel ?? assessedRisk.proposalRiskLevel
    const autonomyDecision = input.autonomyDecision ?? assessedRisk.autonomyDecision
    const riskReasons = input.riskReasons ?? assessedRisk.riskReasons
    const requiresOperatorConfirmation = autonomyDecision === 'await_operator'
    const runtimePolicy = runtimeConfig.applyProposalPolicy({
      proposalKind: input.proposalKind,
      proposalRiskLevel,
      autonomyDecision,
      riskReasons,
      requiresOperatorConfirmation
    })
    const proposal = createProposal(db, {
      ...input,
      proposalRiskLevel,
      autonomyDecision: runtimePolicy.autonomyDecision,
      riskReasons: runtimePolicy.riskReasons,
      confidenceScore: input.confidenceScore ?? assessedRisk.confidenceScore,
      requiresOperatorConfirmation: runtimePolicy.requiresOperatorConfirmation
    })
    const checkpoint = buildProposalCheckpoint({
      proposal,
      nextStatus: proposal.status,
      createdAt: proposal.createdAt
    })

    createCheckpoint(db, {
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      checkpointKind: checkpoint.checkpointKind,
      title: checkpoint.title,
      summary: checkpoint.summary,
      relatedMessageId: checkpoint.relatedMessageId,
      relatedProposalId: checkpoint.relatedProposalId,
      artifactRefs: checkpoint.artifactRefs,
      createdAt: checkpoint.createdAt
    })

    runtimeTelemetry.recordProposalCreated(proposal)

    return proposal
  }

  function loadProposalRuntimeState(proposalId: string): ObjectiveProposalRuntimeState {
    const proposal = getProposal(db, { proposalId })
    if (!proposal) {
      throw new Error(`proposal not found: ${proposalId}`)
    }

    const threadDetail = getThreadDetail(db, { threadId: proposal.threadId })
    if (!threadDetail) {
      throw new Error(`thread not found: ${proposal.threadId}`)
    }

    return {
      proposal,
      votes: threadDetail.votes.filter((vote) => vote.proposalId === proposalId),
      messages: threadDetail.messages
    }
  }

  function writeStatusCheckpoint(proposalId: string, nextStatus: ReturnType<typeof evaluateProposalGate>['status'], messageId?: string) {
    const proposal = getProposal(db, { proposalId })
    if (!proposal) {
      throw new Error(`proposal not found: ${proposalId}`)
    }

    const checkpoint = buildProposalCheckpoint({
      proposal,
      nextStatus,
      messageId
    })

    createCheckpoint(db, {
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      checkpointKind: checkpoint.checkpointKind,
      title: checkpoint.title,
      summary: checkpoint.summary,
      relatedMessageId: checkpoint.relatedMessageId,
      relatedProposalId: checkpoint.relatedProposalId,
      artifactRefs: checkpoint.artifactRefs,
      createdAt: checkpoint.createdAt
    })
  }

  function updateProposalFromGate(input: {
    proposalId: string
    nextStatus: AgentProposalStatus
    messageId?: string
  }) {
    const prior = getProposal(db, { proposalId: input.proposalId })
    const updated = updateProposalStatus(db, {
      proposalId: input.proposalId,
      status: input.nextStatus
    })
    if (!updated) {
      throw new Error(`failed to update proposal: ${input.proposalId}`)
    }

    writeStatusCheckpoint(input.proposalId, input.nextStatus, input.messageId)

    if (prior?.status !== updated.status) {
      if (updated.status === 'awaiting_operator') {
        runtimeTelemetry.recordProposalAwaitingOperator(updated)
      } else if (updated.status === 'blocked') {
        runtimeTelemetry.recordProposalBlocked(updated)
      } else if (updated.status === 'vetoed') {
        runtimeTelemetry.recordProposalVetoed(updated)
      }
    }

    return updated
  }

  return {
    createProposalWithCheckpoint,
    loadProposalRuntimeState,
    updateProposalFromGate
  }
}
