import { describe, expect, it } from 'vitest'
import type { AgentProposalRecord } from '../../../src/shared/archiveContracts'
import { buildProposalCheckpoint } from '../../../src/main/services/agentCheckpointService'

function createProposal(overrides?: Partial<AgentProposalRecord>): AgentProposalRecord {
  return {
    proposalId: 'proposal-1',
    objectiveId: 'objective-1',
    threadId: 'thread-1',
    proposedByParticipantId: 'workspace',
    proposalKind: 'verify_external_claim',
    payload: {
      claim: 'Verify the date with an authoritative source.'
    },
    ownerRole: 'workspace',
    status: 'under_review',
    requiredApprovals: ['workspace'],
    allowVetoBy: ['governance'],
    requiresOperatorConfirmation: false,
    toolPolicyId: 'tool-policy-web-1',
    budget: {
      maxRounds: 2,
      maxToolCalls: 3,
      timeoutMs: 30_000
    },
    derivedFromMessageIds: [],
    artifactRefs: [],
    createdAt: '2026-03-30T10:06:00.000Z',
    updatedAt: '2026-03-30T10:06:00.000Z',
    committedAt: null,
    ...overrides
  }
}

describe('agent checkpoint service', () => {
  it('emits proposal-raised and challenge checkpoints from proposal state changes', () => {
    const raised = buildProposalCheckpoint({
      proposal: createProposal(),
      nextStatus: 'under_review',
      createdAt: '2026-03-30T10:06:30.000Z'
    })
    const challenged = buildProposalCheckpoint({
      proposal: createProposal(),
      nextStatus: 'challenged',
      messageId: 'message-challenge',
      createdAt: '2026-03-30T10:07:00.000Z'
    })

    expect(raised.checkpointKind).toBe('proposal_raised')
    expect(challenged.checkpointKind).toBe('challenge_raised')
  })

  it('emits veto awaiting-operator and committed checkpoints', () => {
    const vetoed = buildProposalCheckpoint({
      proposal: createProposal(),
      nextStatus: 'vetoed',
      createdAt: '2026-03-30T10:07:30.000Z'
    })
    const awaitingOperator = buildProposalCheckpoint({
      proposal: createProposal({
        requiresOperatorConfirmation: true
      }),
      nextStatus: 'awaiting_operator',
      createdAt: '2026-03-30T10:08:00.000Z'
    })
    const committed = buildProposalCheckpoint({
      proposal: createProposal(),
      nextStatus: 'committed',
      createdAt: '2026-03-30T10:08:30.000Z'
    })

    expect(vetoed.checkpointKind).toBe('veto_issued')
    expect(awaitingOperator.checkpointKind).toBe('awaiting_operator_confirmation')
    expect(committed.checkpointKind).toBe('committed')
  })
})
