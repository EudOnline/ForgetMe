import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  AgentArtifactRef,
  AgentCheckpointKind,
  AgentCheckpointRecord,
  AgentProposalRecord,
  AgentSkillPackId,
  CreateAgentObjectiveInput,
  CreateAgentProposalInput
} from '../../../src/shared/archiveContracts'
import {
  agentCheckpointSummarySchema,
  confirmAgentProposalInputSchema,
  createAgentObjectiveInputSchema,
  createAgentProposalInputSchema,
  getAgentObjectiveInputSchema,
  getAgentThreadInputSchema,
  listAgentObjectivesInputSchema,
  respondToAgentProposalInputSchema
} from '../../../src/shared/ipcSchemas'

describe('message-native agent runtime shared contracts', () => {
  it('parses objective creation and objective/thread lookup inputs', () => {
    expect(createAgentObjectiveInputSchema.safeParse({
      title: 'Verify whether this candidate can be approved safely',
      objectiveKind: 'review_decision',
      prompt: 'Can this safe group be approved?'
    }).success).toBe(true)

    expect(listAgentObjectivesInputSchema.parse(undefined)).toEqual({})

    expect(getAgentObjectiveInputSchema.parse({
      objectiveId: 'objective-1'
    })).toEqual({
      objectiveId: 'objective-1'
    })

    expect(getAgentThreadInputSchema.parse({
      threadId: 'thread-1'
    })).toEqual({
      threadId: 'thread-1'
    })
  })

  it('requires bounded policy on external verification and subagent proposals', () => {
    expect(createAgentProposalInputSchema.safeParse({
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      proposalKind: 'spawn_subagent',
      ownerRole: 'workspace',
      payload: {
        specialization: 'web-verifier',
        skillPackIds: ['web-verifier'],
        expectedOutputSchema: 'webVerificationResultSchema'
      },
      toolPolicyId: 'tool-policy-web-1',
      budget: {
        maxRounds: 2,
        maxToolCalls: 3,
        timeoutMs: 30_000
      }
    }).success).toBe(true)

    expect(createAgentProposalInputSchema.safeParse({
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      proposalKind: 'verify_external_claim',
      ownerRole: 'workspace',
      payload: {
        claim: 'The external source confirms the date.'
      }
    }).success).toBe(false)

    expect(respondToAgentProposalInputSchema.parse({
      proposalId: 'proposal-1',
      responderRole: 'governance',
      response: 'challenge',
      comment: 'Need a bounded verification policy before this can proceed.'
    })).toEqual({
      proposalId: 'proposal-1',
      responderRole: 'governance',
      response: 'challenge',
      comment: 'Need a bounded verification policy before this can proceed.'
    })

    expect(confirmAgentProposalInputSchema.parse({
      proposalId: 'proposal-1',
      decision: 'confirm',
      operatorNote: 'Confirmed after reviewing the evidence bundle.'
    })).toEqual({
      proposalId: 'proposal-1',
      decision: 'confirm',
      operatorNote: 'Confirmed after reviewing the evidence bundle.'
    })
  })

  it('parses checkpoint summary nodes and exports typed proposal records', () => {
    expect(agentCheckpointSummarySchema.safeParse({
      checkpointId: 'checkpoint-1',
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      checkpointKind: 'proposal_raised',
      title: 'Proposal raised',
      summary: 'Workspace requested an external verification pass.',
      relatedProposalId: 'proposal-1',
      artifactRefs: [
        {
          kind: 'external_citation_bundle',
          id: 'bundle-1',
          label: 'Verification citations'
        }
      ],
      createdAt: '2026-03-30T00:00:00.000Z'
    }).success).toBe(true)

    const artifactRef: AgentArtifactRef = {
      kind: 'external_citation_bundle',
      id: 'bundle-1',
      label: 'Verification citations'
    }
    const checkpointKind: AgentCheckpointKind = 'proposal_raised'
    const proposal: AgentProposalRecord = {
      proposalId: 'proposal-1',
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      proposedByParticipantId: 'workspace',
      proposalKind: 'verify_external_claim',
      payload: {
        claim: 'The external source confirms the date.'
      },
      ownerRole: 'workspace',
      status: 'awaiting_operator',
      requiredApprovals: ['workspace'],
      allowVetoBy: ['governance'],
      requiresOperatorConfirmation: true,
      toolPolicyId: 'tool-policy-web-1',
      budget: {
        maxRounds: 2,
        maxToolCalls: 3,
        timeoutMs: 30_000
      },
      derivedFromMessageIds: ['message-1'],
      artifactRefs: [artifactRef],
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      committedAt: null
    }
    const checkpoint: AgentCheckpointRecord = {
      checkpointId: 'checkpoint-1',
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      checkpointKind,
      title: 'Proposal raised',
      summary: 'Workspace requested an external verification pass.',
      relatedMessageId: 'message-1',
      relatedProposalId: proposal.proposalId,
      artifactRefs: [artifactRef],
      createdAt: '2026-03-30T00:00:00.000Z'
    }

    expect(proposal.proposalKind).toBe('verify_external_claim')
    expect(checkpoint.checkpointKind).toBe('proposal_raised')

    expectTypeOf<AgentSkillPackId>().toEqualTypeOf<
      'web-verifier' | 'evidence-checker' | 'policy-auditor' | 'draft-composer' | 'compare-analyst'
    >()
    expectTypeOf<CreateAgentObjectiveInput['objectiveKind']>().toEqualTypeOf<
      'review_decision' | 'evidence_investigation' | 'user_response' | 'policy_change' | 'publication'
    >()
    expectTypeOf<CreateAgentProposalInput['proposalKind']>().toEqualTypeOf<AgentProposalRecord['proposalKind']>()
  })
})
