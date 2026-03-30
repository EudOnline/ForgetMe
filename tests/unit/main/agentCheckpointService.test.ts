import { describe, expect, it } from 'vitest'
import { buildProposalCheckpoint } from '../../../src/main/services/agentCheckpointService'

describe('agentCheckpointService', () => {
  it('emits checkpoint summaries for proposal lifecycle transitions', () => {
    const raised = buildProposalCheckpoint({
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      proposalId: 'proposal-1',
      ownerRole: 'workspace',
      transition: 'raised'
    })
    const challenged = buildProposalCheckpoint({
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      proposalId: 'proposal-1',
      ownerRole: 'workspace',
      transition: 'challenged'
    })
    const approved = buildProposalCheckpoint({
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      proposalId: 'proposal-1',
      ownerRole: 'workspace',
      transition: 'approved'
    })
    const vetoed = buildProposalCheckpoint({
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      proposalId: 'proposal-1',
      ownerRole: 'governance',
      transition: 'vetoed'
    })
    const committed = buildProposalCheckpoint({
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      proposalId: 'proposal-1',
      ownerRole: 'review',
      transition: 'committed'
    })

    expect(raised.checkpointKind).toBe('proposal_raised')
    expect(challenged.checkpointKind).toBe('challenge_raised')
    expect(approved.checkpointKind).toBe('consensus_reached')
    expect(vetoed.checkpointKind).toBe('veto_issued')
    expect(committed.checkpointKind).toBe('committed')
  })
})
