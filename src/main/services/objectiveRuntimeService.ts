import { evaluateProposalGate } from './agentProposalGateService'
import { buildProposalCheckpoint } from './agentCheckpointService'
import type { createExternalVerificationBrokerService } from './externalVerificationBrokerService'
import type { createSubagentRegistryService } from './subagentRegistryService'
import {
  appendAgentMessageV2,
  createCheckpoint,
  createProposal,
  createSubagent,
  getObjectiveDetail,
  getProposal,
  getThreadDetail,
  recordProposalVote,
  updateProposalStatus,
  type AgentObjectiveDetail,
  type CreateProposalInput
} from './objectivePersistenceService'
import type { ArchiveDatabase } from './db'
import type { createFacilitatorAgentService } from './agents/facilitatorAgentService'

const WEB_VERIFIER_TOOL_POLICY_ID = 'external-verification-policy'
const WEB_VERIFIER_BUDGET = {
  maxRounds: 2,
  maxToolCalls: 3,
  timeoutMs: 30_000
} as const

type FacilitatorService = ReturnType<typeof createFacilitatorAgentService>
type ExternalVerificationBrokerService = ReturnType<typeof createExternalVerificationBrokerService>
type SubagentRegistryService = ReturnType<typeof createSubagentRegistryService>

export type ObjectiveRuntimeDependencies = {
  db: ArchiveDatabase
  facilitator: FacilitatorService
  externalVerificationBroker: ExternalVerificationBrokerService
  subagentRegistry: SubagentRegistryService
}

export function createObjectiveRuntimeService(dependencies: ObjectiveRuntimeDependencies) {
  const { db } = dependencies

  function createProposalWithCheckpoint(input: CreateProposalInput) {
    const proposal = createProposal(db, input)
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

    return proposal
  }

  function loadProposalRuntimeState(proposalId: string) {
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

  return {
    startObjective(input: {
      title: string
      objectiveKind: Parameters<FacilitatorService['acceptObjective']>[0]['objectiveKind']
      prompt: string
      initiatedBy?: Parameters<FacilitatorService['acceptObjective']>[0]['initiatedBy']
    }) {
      return dependencies.facilitator.acceptObjective({
        db,
        title: input.title,
        objectiveKind: input.objectiveKind,
        prompt: input.prompt,
        initiatedBy: input.initiatedBy
      })
    },

    createProposal(input: Omit<CreateProposalInput, 'status'> & {
      status?: CreateProposalInput['status']
    }) {
      return createProposalWithCheckpoint({
        ...input,
        requiredApprovals: input.requiredApprovals ?? [input.ownerRole],
        allowVetoBy: input.allowVetoBy ?? ['governance'],
        status: input.status ?? 'under_review'
      })
    },

    raiseBlockingChallenge(input: {
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
      const runtimeState = loadProposalRuntimeState(input.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: [...runtimeState.messages, challengeMessage]
      })
      const updated = updateProposalStatus(db, {
        proposalId: input.proposalId,
        status: gate.status
      })
      if (!updated) {
        throw new Error(`failed to update proposal: ${input.proposalId}`)
      }

      writeStatusCheckpoint(input.proposalId, gate.status, challengeMessage.messageId)

      return updated
    },

    vetoProposal(input: {
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
      const runtimeState = loadProposalRuntimeState(input.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: runtimeState.messages
      })
      const updated = updateProposalStatus(db, {
        proposalId: input.proposalId,
        status: gate.status
      })
      if (!updated) {
        throw new Error(`failed to update proposal: ${input.proposalId}`)
      }

      writeStatusCheckpoint(input.proposalId, gate.status)

      return updated
    },

    async requestExternalVerification(input: {
      objectiveId: string
      threadId: string
      proposedByParticipantId: string
      claim: string
      query: string
    }) {
      const proposal = createProposalWithCheckpoint({
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        proposedByParticipantId: input.proposedByParticipantId,
        proposalKind: 'verify_external_claim',
        payload: {
          claim: input.claim,
          query: input.query
        },
        ownerRole: 'workspace',
        status: 'under_review',
        requiredApprovals: ['workspace'],
        allowVetoBy: ['governance'],
        toolPolicyId: WEB_VERIFIER_TOOL_POLICY_ID,
        budget: { ...WEB_VERIFIER_BUDGET }
      })

      const registeredSubagent = dependencies.subagentRegistry.createSubagent({
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        parentThreadId: input.threadId,
        parentAgentRole: 'workspace',
        specialization: 'web-verifier',
        budget: { ...WEB_VERIFIER_BUDGET }
      })

      const subagent = createSubagent(db, {
        objectiveId: registeredSubagent.objectiveId,
        threadId: registeredSubagent.threadId,
        parentThreadId: registeredSubagent.parentThreadId,
        parentAgentRole: registeredSubagent.parentAgentRole,
        specialization: registeredSubagent.specialization,
        skillPackIds: registeredSubagent.skillPackIds,
        toolPolicyId: WEB_VERIFIER_TOOL_POLICY_ID,
        budget: registeredSubagent.budget,
        expectedOutputSchema: registeredSubagent.outputSchema,
        status: 'running'
      })

      createCheckpoint(db, {
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        checkpointKind: 'subagent_spawned',
        title: 'Subagent spawned',
        summary: `Spawned ${subagent.specialization} for bounded external verification.`,
        relatedProposalId: proposal.proposalId
      })

      const citationBundle = await dependencies.externalVerificationBroker.verifyClaim({
        claim: input.claim,
        query: input.query
      })

      createCheckpoint(db, {
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        checkpointKind: 'external_verification_completed',
        title: 'External verification completed',
        summary: `Verification verdict: ${citationBundle.verdict}.`,
        relatedProposalId: proposal.proposalId,
        artifactRefs: citationBundle.sources.map((source) => ({
          kind: 'external_citation_bundle',
          id: source.url,
          label: source.title
        }))
      })

      return {
        proposal,
        subagent,
        citationBundle
      }
    },

    approveProposalAsOwner(input: {
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

      const runtimeState = loadProposalRuntimeState(input.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: runtimeState.messages
      })
      const updated = updateProposalStatus(db, {
        proposalId: input.proposalId,
        status: gate.status
      })
      if (!updated) {
        throw new Error(`failed to update proposal: ${input.proposalId}`)
      }

      writeStatusCheckpoint(input.proposalId, gate.status)

      return updated
    },

    getObjectiveDetail(input: {
      objectiveId: string
    }): AgentObjectiveDetail | null {
      return getObjectiveDetail(db, input)
    }
  }
}
