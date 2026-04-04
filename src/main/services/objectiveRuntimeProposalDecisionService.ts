import { evaluateProposalGate } from './agentProposalGateService'
import { createObjectiveRuntimeConfigService } from './objectiveRuntimeConfigService'
import { createObjectiveRuntimeTelemetryService } from './objectiveRuntimeTelemetryService'
import type { createObjectiveRuntimeProposalStateService } from './objectiveRuntimeProposalStateService'
import {
  appendAgentMessageV2,
  getProposal,
  recordProposalVote
} from './objectivePersistenceService'
import type {
  AgentProposalRecord,
  ConfirmAgentProposalInput,
  RespondToAgentProposalInput
} from '../../shared/objectiveRuntimeContracts'
import type { ArchiveDatabase } from './db'
import {
  proposalIsAutoCommittable,
  proposalNeedsOperator
} from './objectiveAutonomySelectorsService'

type ProposalStateService = ReturnType<typeof createObjectiveRuntimeProposalStateService>

export function createObjectiveRuntimeProposalDecisionService(dependencies: {
  db: ArchiveDatabase
  proposalStateService: ProposalStateService
  runtimeTelemetry?: ReturnType<typeof createObjectiveRuntimeTelemetryService>
  runtimeConfig?: ReturnType<typeof createObjectiveRuntimeConfigService>
}) {
  const { db } = dependencies
  const runtimeTelemetry = dependencies.runtimeTelemetry ?? createObjectiveRuntimeTelemetryService({ db })
  const runtimeConfig = dependencies.runtimeConfig ?? createObjectiveRuntimeConfigService({
    env: {}
  })

  function proposalNeedsOperatorNow(
    proposal: Pick<AgentProposalRecord, 'proposalKind' | 'autonomyDecision' | 'proposalRiskLevel' | 'requiresOperatorConfirmation'>
  ) {
    return proposalNeedsOperator(proposal)
      || runtimeConfig.shouldRequireOperatorForProposal({
        proposalKind: proposal.proposalKind
      })
  }

  function applyRuntimePolicyToNextStatus(
    proposal: Pick<AgentProposalRecord, 'proposalKind'>,
    nextStatus: AgentProposalRecord['status']
  ) {
    if (
      nextStatus === 'committable'
      && runtimeConfig.shouldRequireOperatorForProposal({
        proposalKind: proposal.proposalKind
      })
    ) {
      return 'awaiting_operator' as const
    }

    return nextStatus
  }

  function raiseBlockingChallenge(input: {
    objectiveId: string
    threadId: string
    proposalId: string
    fromParticipantId: string
    body: string
  }) {
    const challengeMessage = appendAgentMessageV2(db, {
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      fromParticipantId: input.fromParticipantId,
      kind: 'challenge',
      body: input.body,
      round: 1,
      blocking: true
    })
    const runtimeState = dependencies.proposalStateService.loadProposalRuntimeState(input.proposalId)
    const gate = evaluateProposalGate({
      proposal: runtimeState.proposal,
      votes: runtimeState.votes,
      messages: [...runtimeState.messages, challengeMessage]
    })

    return dependencies.proposalStateService.updateProposalFromGate({
      proposalId: input.proposalId,
      nextStatus: gate.status,
      messageId: challengeMessage.messageId
    })
  }

  function vetoProposal(input: {
    objectiveId: string
    threadId: string
    proposalId: string
    rationale: string
  }) {
    recordProposalVote(db, {
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      proposalId: input.proposalId,
      voterRole: 'governance',
      vote: 'veto',
      comment: input.rationale
    })
    const runtimeState = dependencies.proposalStateService.loadProposalRuntimeState(input.proposalId)
    const gate = evaluateProposalGate({
      proposal: runtimeState.proposal,
      votes: runtimeState.votes,
      messages: runtimeState.messages
    })
    const nextStatus = runtimeState.proposal.allowVetoBy.includes('governance')
      ? 'vetoed'
      : gate.status

    return dependencies.proposalStateService.updateProposalFromGate({
      proposalId: input.proposalId,
      nextStatus
    })
  }

  function approveProposalAsOwner(input: {
    objectiveId: string
    threadId: string
    proposalId: string
  }) {
    const proposal = getProposal(db, { proposalId: input.proposalId })
    if (!proposal) {
      throw new Error(`proposal not found: ${input.proposalId}`)
    }

    recordProposalVote(db, {
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      proposalId: input.proposalId,
      voterRole: proposal.ownerRole,
      vote: 'approve',
      comment: 'Owner approved the proposal.'
    })

    const runtimeState = dependencies.proposalStateService.loadProposalRuntimeState(input.proposalId)
    const gate = evaluateProposalGate({
      proposal: runtimeState.proposal,
      votes: runtimeState.votes,
      messages: runtimeState.messages
    })

    return dependencies.proposalStateService.updateProposalFromGate({
      proposalId: input.proposalId,
      nextStatus: applyRuntimePolicyToNextStatus(runtimeState.proposal, gate.status)
    })
  }

  async function respondToAgentProposal(input: RespondToAgentProposalInput): Promise<AgentProposalRecord | null> {
    const proposal = getProposal(db, { proposalId: input.proposalId })
    if (!proposal) {
      return null
    }

    if (input.response === 'challenge') {
      return raiseBlockingChallenge({
        objectiveId: proposal.objectiveId,
        threadId: proposal.threadId,
        proposalId: proposal.proposalId,
        fromParticipantId: input.responderRole,
        body: input.comment ?? `${input.responderRole} raised a blocking challenge.`
      })
    }

    recordProposalVote(db, {
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      proposalId: proposal.proposalId,
      voterRole: input.responderRole,
      vote: input.response,
      comment: input.comment,
      artifactRefs: input.artifactRefs
    })

    const runtimeState = dependencies.proposalStateService.loadProposalRuntimeState(proposal.proposalId)
    const gate = evaluateProposalGate({
      proposal: runtimeState.proposal,
      votes: runtimeState.votes,
      messages: runtimeState.messages
    })
    const nextStatus = input.response === 'reject'
      ? 'blocked'
      : applyRuntimePolicyToNextStatus(runtimeState.proposal, gate.status)

    return dependencies.proposalStateService.updateProposalFromGate({
      proposalId: proposal.proposalId,
      nextStatus
    })
  }

  function autoCommitProposalIfEligible(proposal: AgentProposalRecord) {
    if (
      proposal.status === 'committable'
      && runtimeConfig.shouldRequireOperatorForProposal({
        proposalKind: proposal.proposalKind
      })
    ) {
      return dependencies.proposalStateService.updateProposalFromGate({
        proposalId: proposal.proposalId,
        nextStatus: 'awaiting_operator'
      })
    }

    if (!proposalIsAutoCommittable(proposal)) {
      return proposal
    }

    const committed = dependencies.proposalStateService.updateProposalFromGate({
      proposalId: proposal.proposalId,
      nextStatus: 'committed'
    })
    runtimeTelemetry.recordProposalAutoCommitted(committed)

    return committed
  }

  async function confirmAgentProposal(input: ConfirmAgentProposalInput): Promise<AgentProposalRecord | null> {
    const proposal = getProposal(db, { proposalId: input.proposalId })
    if (!proposal) {
      return null
    }

    if (
      input.decision === 'confirm'
      && (
        proposal.status === 'committed'
        || !proposalNeedsOperatorNow(proposal)
      )
    ) {
      return proposal
    }

    const runtimeState = dependencies.proposalStateService.loadProposalRuntimeState(proposal.proposalId)
    const decisionMessage = input.operatorNote
      ? appendAgentMessageV2(db, {
        objectiveId: proposal.objectiveId,
        threadId: proposal.threadId,
        fromParticipantId: 'operator',
        kind: 'decision',
        body: input.operatorNote,
        round: (runtimeState.messages.at(-1)?.round ?? 0) + 1,
        blocking: input.decision === 'block'
      })
      : null
    const nextStatus = input.decision === 'block'
      ? 'blocked'
      : proposalNeedsOperatorNow(runtimeState.proposal)
        ? 'committed'
        : evaluateProposalGate({
          proposal: runtimeState.proposal,
          votes: runtimeState.votes,
          messages: runtimeState.messages,
          operatorConfirmed: true
        }).status

    return dependencies.proposalStateService.updateProposalFromGate({
      proposalId: proposal.proposalId,
      nextStatus,
      messageId: decisionMessage?.messageId
    })
  }

  return {
    raiseBlockingChallenge,
    vetoProposal,
    approveProposalAsOwner,
    autoCommitProposalIfEligible,
    respondToAgentProposal,
    confirmAgentProposal
  }
}
