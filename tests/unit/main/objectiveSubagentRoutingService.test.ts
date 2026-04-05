import { describe, expect, it } from 'vitest'
import { createObjectiveSubagentRoutingService } from '../../../src/main/services/objectiveSubagentRoutingService'
import { createSubagentRegistryService } from '../../../src/main/services/subagentRegistryService'

function buildProposal(overrides: Record<string, unknown> = {}) {
  return {
    proposalId: 'proposal-1',
    objectiveId: 'objective-1',
    threadId: 'thread-1',
    proposedByParticipantId: 'workspace',
    proposalKind: 'verify_external_claim',
    payload: {
      claim: 'The source confirms the announcement date.',
      query: 'official announcement date'
    },
    ownerRole: 'workspace',
    status: 'under_review',
    requiredApprovals: ['workspace'],
    allowVetoBy: ['governance'],
    proposalRiskLevel: 'critical',
    autonomyDecision: 'await_operator',
    riskReasons: ['external_verification_required'],
    confidenceScore: 0.9,
    requiresOperatorConfirmation: true,
    toolPolicyId: 'external-verification-policy',
    budget: {
      maxRounds: 2,
      maxToolCalls: 5,
      timeoutMs: 30_000
    },
    derivedFromMessageIds: [],
    artifactRefs: [],
    createdAt: '2026-04-05T00:00:00.000Z',
    updatedAt: '2026-04-05T00:00:00.000Z',
    committedAt: null,
    ...overrides
  } as any
}

describe('objective subagent routing service', () => {
  it('wraps external verification runner failures in a structured runtime failure', async () => {
    const proposal = buildProposal()
    const routing = createObjectiveSubagentRoutingService({
      subagentRegistry: createSubagentRegistryService(),
      helpers: {
        createProposalWithCheckpoint: () => proposal,
        updateProposalFromGate: () => proposal
      },
      runWebVerifierSubagent: async () => {
        throw new Error('Tool search_web exceeded timeout budget.')
      },
      runEvidenceCheckerSubagent: async () => {
        throw new Error('not used')
      },
      runCompareAnalystSubagent: async () => {
        throw new Error('not used')
      },
      runDraftComposerSubagent: async () => {
        throw new Error('not used')
      },
      runPolicyAuditorSubagent: async () => {
        throw new Error('not used')
      }
    })

    await expect(routing.requestExternalVerification({
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      proposedByParticipantId: 'workspace',
      claim: 'The source confirms the announcement date.',
      query: 'official announcement date'
    })).rejects.toMatchObject({
      kind: 'objective_runtime_failure',
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      proposalId: proposal.proposalId,
      failureType: 'tool_timeout',
      failureEventType: 'tool_timeout',
      proposal: expect.objectContaining({
        proposalId: proposal.proposalId
      })
    })
  })
})
