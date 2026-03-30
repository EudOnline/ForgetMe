import { describe, expect, it } from 'vitest'
import { evaluateProposalGate } from '../../../src/main/services/agentProposalGateService'

describe('agentProposalGateService', () => {
  it('keeps proposals challenged when a blocking challenge is still open', () => {
    const result = evaluateProposalGate({
      proposal: {
        ownerRole: 'workspace',
        requiresOperatorConfirmation: false
      },
      messages: [
        {
          kind: 'challenge',
          blocking: true
        }
      ],
      votes: [
        {
          voterRole: 'workspace',
          vote: 'approve'
        }
      ]
    })

    expect(result.status).toBe('challenged')
    expect(result.hasBlockingChallenge).toBe(true)
  })

  it('marks proposals vetoed when governance issues a veto', () => {
    const result = evaluateProposalGate({
      proposal: {
        ownerRole: 'workspace',
        requiresOperatorConfirmation: false
      },
      votes: [
        {
          voterRole: 'governance',
          vote: 'veto'
        }
      ]
    })

    expect(result.status).toBe('vetoed')
    expect(result.hasGovernanceVeto).toBe(true)
  })

  it('moves owner-approved proposals to operator confirmation or committable state', () => {
    const awaitingOperator = evaluateProposalGate({
      proposal: {
        ownerRole: 'review',
        requiresOperatorConfirmation: true
      },
      votes: [
        {
          voterRole: 'review',
          vote: 'approve'
        }
      ]
    })

    const committable = evaluateProposalGate({
      proposal: {
        ownerRole: 'workspace',
        requiresOperatorConfirmation: false
      },
      votes: [
        {
          voterRole: 'workspace',
          vote: 'approve'
        }
      ]
    })

    expect(awaitingOperator.status).toBe('awaiting_operator')
    expect(committable.status).toBe('committable')
  })
})
