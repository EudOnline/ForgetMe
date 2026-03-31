import { createSpawnSubagentRunnerRegistry } from './spawnSubagentRunnerRegistryService'
import type { createSubagentRegistryService } from './subagentRegistryService'
import { parseCompareAnalystPayload } from './subagentRunners/compareAnalystRunner'
import { parseDraftComposerPayload } from './subagentRunners/draftComposerRunner'
import { parsePolicyAuditorPayload } from './subagentRunners/policyAuditorRunner'
import type {
  AgentProposalRecord,
  AgentProposalStatus,
  AgentRole,
  AgentSkillPackId,
  AgentThreadDetail
} from '../../shared/archiveContracts'
import type { CreateProposalInput } from './objectivePersistenceService'

type SubagentRegistryService = ReturnType<typeof createSubagentRegistryService>

export type ObjectiveSubagentExecutionResult<TExtra extends Record<string, unknown> = Record<never, never>> = {
  subagent: {
    threadId: string
    subagentId: string
    summary?: string | null
  }
  subthread: {
    threadId: string
  }
} & TExtra

type ProposalRuntimeHelpers = {
  createProposalWithCheckpoint: (input: CreateProposalInput) => AgentProposalRecord
  updateProposalFromGate: (input: {
    proposalId: string
    nextStatus: AgentProposalStatus
    messageId?: string
  }) => AgentProposalRecord
}

export function createObjectiveSubagentRoutingService<
  TWebVerifierExecution extends ObjectiveSubagentExecutionResult,
  TEvidenceCheckerExecution extends ObjectiveSubagentExecutionResult,
  TCompareAnalystExecution extends ObjectiveSubagentExecutionResult,
  TDraftComposerExecution extends ObjectiveSubagentExecutionResult,
  TPolicyAuditorExecution extends ObjectiveSubagentExecutionResult
>(dependencies: {
  subagentRegistry: SubagentRegistryService
  helpers: ProposalRuntimeHelpers
  runWebVerifierSubagent: (input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    claim: string
    query: string
    localEvidenceFileId?: string | null
  }) => Promise<TWebVerifierExecution>
  runEvidenceCheckerSubagent: (input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    fileId: string
    crossCheckClaim?: string | null
    crossCheckQuery?: string | null
  }) => Promise<TEvidenceCheckerExecution>
  runCompareAnalystSubagent: (input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    question: string
    scope: { kind: 'global' } | { kind: 'person'; canonicalPersonId: string } | { kind: 'group'; anchorPersonId: string }
    expressionMode: 'grounded' | 'advice'
    workflowKind: 'default' | 'persona_draft_sandbox'
  }) => Promise<TCompareAnalystExecution>
  runDraftComposerSubagent: (input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    question: string
    scope: { kind: 'global' } | { kind: 'person'; canonicalPersonId: string } | { kind: 'group'; anchorPersonId: string }
    expressionMode: 'grounded' | 'advice'
    sessionId?: string | null
  }) => Promise<TDraftComposerExecution>
  runPolicyAuditorSubagent: (input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    policyKey: string
    role: AgentRole
  }) => Promise<TPolicyAuditorExecution>
}) {
  function parseWebVerifierPayload(payload: Record<string, unknown>) {
    const claim = typeof payload.claim === 'string' ? payload.claim.trim() : ''
    const query = typeof payload.query === 'string' ? payload.query.trim() : ''
    const localEvidenceFileId = typeof payload.localEvidenceFileId === 'string'
      ? payload.localEvidenceFileId.trim()
      : ''

    if (!claim || !query) {
      throw new Error('web-verifier payload requires non-empty claim and query')
    }

    return {
      claim,
      query,
      localEvidenceFileId: localEvidenceFileId || null
    }
  }

  function parseEvidenceCheckerPayload(payload: Record<string, unknown>) {
    const fileId = typeof payload.fileId === 'string' ? payload.fileId.trim() : ''
    const crossCheckClaim = typeof payload.crossCheckClaim === 'string'
      ? payload.crossCheckClaim.trim()
      : ''
    const crossCheckQuery = typeof payload.crossCheckQuery === 'string'
      ? payload.crossCheckQuery.trim()
      : ''

    if (!fileId) {
      throw new Error('evidence-checker payload requires non-empty fileId')
    }

    if ((crossCheckClaim && !crossCheckQuery) || (!crossCheckClaim && crossCheckQuery)) {
      throw new Error('evidence-checker payload requires both crossCheckClaim and crossCheckQuery when either is provided')
    }

    return {
      fileId,
      crossCheckClaim: crossCheckClaim || null,
      crossCheckQuery: crossCheckQuery || null
    }
  }

  function getSubagentProfile(specialization: AgentSkillPackId) {
    return dependencies.subagentRegistry.getProfile(specialization)
  }

  function getRequiredToolPolicyId(specialization: AgentSkillPackId) {
    const toolPolicyId = getSubagentProfile(specialization).defaultToolPolicyId
    if (!toolPolicyId) {
      throw new Error(`Subagent specialization ${specialization} is missing a default tool policy`)
    }

    return toolPolicyId
  }

  const spawnSubagentRunnerRegistry = createSpawnSubagentRunnerRegistry({
    'web-verifier': {
      parsePayload: parseWebVerifierPayload,
      run: async ({ proposal, requestedByParticipantId, payload }) => dependencies.runWebVerifierSubagent({
        proposal,
        requestedByParticipantId,
        claim: payload.claim,
        query: payload.query,
        localEvidenceFileId: payload.localEvidenceFileId
      })
    },
    'evidence-checker': {
      parsePayload: parseEvidenceCheckerPayload,
      run: async ({ proposal, requestedByParticipantId, payload }) => dependencies.runEvidenceCheckerSubagent({
        proposal,
        requestedByParticipantId,
        fileId: payload.fileId,
        crossCheckClaim: payload.crossCheckClaim,
        crossCheckQuery: payload.crossCheckQuery
      })
    },
    'compare-analyst': {
      parsePayload: parseCompareAnalystPayload,
      run: async ({ proposal, requestedByParticipantId, payload }) => dependencies.runCompareAnalystSubagent({
        proposal,
        requestedByParticipantId,
        question: payload.question,
        scope: payload.scope,
        expressionMode: payload.expressionMode,
        workflowKind: payload.workflowKind
      })
    },
    'draft-composer': {
      parsePayload: parseDraftComposerPayload,
      run: async ({ proposal, requestedByParticipantId, payload }) => dependencies.runDraftComposerSubagent({
        proposal,
        requestedByParticipantId,
        question: payload.question,
        scope: payload.scope,
        expressionMode: payload.expressionMode,
        sessionId: payload.sessionId
      })
    },
    'policy-auditor': {
      parsePayload: parsePolicyAuditorPayload,
      run: async ({ proposal, requestedByParticipantId, payload }) => dependencies.runPolicyAuditorSubagent({
        proposal,
        requestedByParticipantId,
        policyKey: payload.policyKey,
        role: payload.role
      })
    }
  })

  async function executeCommittedSpawnSubagentProposal(proposal: AgentProposalRecord) {
    return spawnSubagentRunnerRegistry.executeCommittedProposal(proposal)
  }

  async function autoCommitEligibleSpawnSubagentProposal(proposal: AgentProposalRecord) {
    if (
      proposal.proposalKind !== 'spawn_subagent'
      || proposal.status !== 'committable'
      || proposal.requiresOperatorConfirmation
    ) {
      return proposal
    }

    const committed = dependencies.helpers.updateProposalFromGate({
      proposalId: proposal.proposalId,
      nextStatus: 'committed'
    })

    await executeCommittedSpawnSubagentProposal(committed)

    return committed
  }

  async function requestExternalVerification(input: {
    objectiveId: string
    threadId: string
    proposedByParticipantId: string
    claim: string
    query: string
  }): Promise<{ proposal: AgentProposalRecord } & TWebVerifierExecution> {
    const verifierProfile = getSubagentProfile('web-verifier')
    const proposal = dependencies.helpers.createProposalWithCheckpoint({
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
      toolPolicyId: getRequiredToolPolicyId('web-verifier'),
      budget: { ...verifierProfile.defaultBudget }
    })
    const execution = await dependencies.runWebVerifierSubagent({
      proposal,
      requestedByParticipantId: input.proposedByParticipantId,
      claim: input.claim,
      query: input.query
    })

    return {
      proposal,
      ...execution
    }
  }

  return {
    executeCommittedSpawnSubagentProposal,
    autoCommitEligibleSpawnSubagentProposal,
    requestExternalVerification
  }
}
