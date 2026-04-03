import { describe, expect, it } from 'vitest'
import type { AgentMessageRecordV2, AgentProposalRecord, AgentVoteRecord } from '../../../src/shared/archiveContracts'
import { evaluateProposalGate } from '../../../src/main/services/agentProposalGateService'

function createProposal(overrides?: Partial<AgentProposalRecord>): AgentProposalRecord {
  return {
    proposalId: 'proposal-1',
    objectiveId: 'objective-1',
    threadId: 'thread-1',
    proposedByParticipantId: 'workspace',
    proposalKind: 'verify_external_claim',
    payload: { claim: 'Verify the date externally.' },
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
    derivedFromMessageIds: ['message-challenge'],
    artifactRefs: [],
    createdAt: '2026-03-30T10:03:00.000Z',
    updatedAt: '2026-03-30T10:03:00.000Z',
    committedAt: null,
    ...overrides
  }
}

function createMessage(overrides?: Partial<AgentMessageRecordV2>): AgentMessageRecordV2 {
  return {
    messageId: 'message-challenge',
    objectiveId: 'objective-1',
    threadId: 'thread-1',
    fromParticipantId: 'review',
    toParticipantId: null,
    kind: 'challenge',
    body: 'We still need tighter evidence bounds.',
    refs: [],
    replyToMessageId: null,
    round: 1,
    confidence: null,
    blocking: true,
    createdAt: '2026-03-30T10:04:00.000Z',
    ...overrides
  }
}

function createVote(overrides?: Partial<AgentVoteRecord>): AgentVoteRecord {
  return {
    voteId: 'vote-1',
    objectiveId: 'objective-1',
    threadId: 'thread-1',
    proposalId: 'proposal-1',
    voterRole: 'workspace',
    vote: 'approve',
    comment: 'Owner approves the bounded plan.',
    createdAt: '2026-03-30T10:05:00.000Z',
    ...overrides
  }
}

describe('agent proposal gate service', () => {
  it('keeps a proposal challenged when a blocking challenge remains unresolved', () => {
    const result = evaluateProposalGate({
      proposal: createProposal(),
      messages: [createMessage()],
      votes: [createVote()]
    })

    expect(result.status).toBe('challenged')
    expect(result.hasBlockingChallenge).toBe(true)
  })

  it('marks a proposal vetoed when governance casts a veto', () => {
    const result = evaluateProposalGate({
      proposal: createProposal(),
      messages: [],
      votes: [
        createVote(),
        createVote({
          voteId: 'vote-2',
          voterRole: 'governance',
          vote: 'veto',
          comment: 'This proposal violates the policy boundary.'
        })
      ]
    })

    expect(result.status).toBe('vetoed')
    expect(result.hasGovernanceVeto).toBe(true)
  })

  it('moves to awaiting_operator when owner approval exists and operator confirmation is required', () => {
    const result = evaluateProposalGate({
      proposal: createProposal({
        requiresOperatorConfirmation: true
      }),
      messages: [],
      votes: [createVote()]
    })

    expect(result.status).toBe('awaiting_operator')
    expect(result.ownerApproved).toBe(true)
  })

  it('moves to committable when owner approval exists and no higher gate blocks it', () => {
    const result = evaluateProposalGate({
      proposal: createProposal(),
      messages: [],
      votes: [createVote()]
    })

    expect(result.status).toBe('committable')
  })

  it('does not treat insufficient verification evidence as effectively ready to commit', () => {
    const result = evaluateProposalGate({
      proposal: createProposal(),
      messages: [],
      votes: [createVote()],
      evidenceVerdict: 'insufficient'
    } as any)

    expect(result.status).toBe('under_review')
  })
})
