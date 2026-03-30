import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from './testing-library'
import { ObjectiveWorkbenchPage } from '../../../src/renderer/pages/ObjectiveWorkbenchPage'

afterEach(() => {
  Reflect.deleteProperty(window, 'archiveApi')
  vi.unstubAllGlobals()
})

function installArchiveApi(archiveApi: unknown) {
  window.archiveApi = archiveApi as Window['archiveApi']
}

function buildObjectiveSummary() {
  return {
    objectiveId: 'objective-1',
    title: 'Verify an external claim before responding',
    objectiveKind: 'evidence_investigation',
    status: 'in_progress',
    prompt: 'Check the source before we answer the user.',
    initiatedBy: 'operator',
    ownerRole: 'workspace',
    mainThreadId: 'thread-main-1',
    riskLevel: 'medium',
    budget: null,
    requiresOperatorInput: false,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  }
}

function buildObjectiveDetail() {
  return {
    ...buildObjectiveSummary(),
    threads: [
      {
        threadId: 'thread-main-1',
        objectiveId: 'objective-1',
        parentThreadId: null,
        threadKind: 'main',
        ownerRole: 'workspace',
        title: 'Verify an external claim before responding · Main Thread',
        status: 'open',
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
        closedAt: null
      }
    ],
    participants: [
      {
        threadParticipantId: 'participant-workspace',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        participantKind: 'role',
        participantId: 'workspace',
        role: 'workspace',
        displayLabel: 'workspace',
        invitedByParticipantId: null,
        joinedAt: '2026-03-30T00:00:00.000Z',
        leftAt: null
      },
      {
        threadParticipantId: 'participant-review',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        participantKind: 'role',
        participantId: 'review',
        role: 'review',
        displayLabel: 'review',
        invitedByParticipantId: null,
        joinedAt: '2026-03-30T00:00:00.000Z',
        leftAt: null
      },
      {
        threadParticipantId: 'participant-governance',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        participantKind: 'role',
        participantId: 'governance',
        role: 'governance',
        displayLabel: 'governance',
        invitedByParticipantId: null,
        joinedAt: '2026-03-30T00:00:00.000Z',
        leftAt: null
      }
    ],
    proposals: [
      {
        proposalId: 'proposal-1',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        proposedByParticipantId: 'workspace',
        proposalKind: 'verify_external_claim',
        payload: {
          claim: 'The external source confirms the announcement date.'
        },
        ownerRole: 'workspace',
        status: 'under_review',
        requiredApprovals: ['workspace'],
        allowVetoBy: ['governance'],
        requiresOperatorConfirmation: true,
        toolPolicyId: 'tool-policy-web-1',
        budget: {
          maxRounds: 2,
          maxToolCalls: 3,
          timeoutMs: 30000
        },
        derivedFromMessageIds: [],
        artifactRefs: [],
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
        committedAt: null
      },
      {
        proposalId: 'proposal-2',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        proposedByParticipantId: 'review',
        proposalKind: 'approve_review_item',
        payload: {
          queueItemId: 'rq-1'
        },
        ownerRole: 'review',
        status: 'awaiting_operator',
        requiredApprovals: ['review'],
        allowVetoBy: ['governance'],
        requiresOperatorConfirmation: true,
        toolPolicyId: null,
        budget: null,
        derivedFromMessageIds: [],
        artifactRefs: [],
        createdAt: '2026-03-30T00:05:00.000Z',
        updatedAt: '2026-03-30T00:05:00.000Z',
        committedAt: null
      }
    ],
    checkpoints: [
      {
        checkpointId: 'checkpoint-1',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        checkpointKind: 'goal_accepted',
        title: 'Goal accepted',
        summary: 'Facilitator accepted the objective.',
        relatedMessageId: null,
        relatedProposalId: null,
        artifactRefs: [],
        createdAt: '2026-03-30T00:00:00.000Z'
      },
      {
        checkpointId: 'checkpoint-2',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        checkpointKind: 'challenge_raised',
        title: 'Challenge raised',
        summary: 'Governance requested a bounded verification policy.',
        relatedMessageId: 'message-2',
        relatedProposalId: 'proposal-1',
        artifactRefs: [],
        createdAt: '2026-03-30T00:02:00.000Z'
      },
      {
        checkpointId: 'checkpoint-3',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        checkpointKind: 'awaiting_operator_confirmation',
        title: 'Awaiting operator confirmation',
        summary: 'Review approval is ready for operator confirmation.',
        relatedMessageId: null,
        relatedProposalId: 'proposal-2',
        artifactRefs: [],
        createdAt: '2026-03-30T00:05:00.000Z'
      }
    ],
    subagents: [
      {
        subagentId: 'subagent-1',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        parentThreadId: 'thread-main-1',
        parentAgentRole: 'workspace',
        specialization: 'web-verifier',
        skillPackIds: ['web-verifier'],
        toolPolicyId: 'tool-policy-web-1',
        budget: {
          maxRounds: 2,
          maxToolCalls: 3,
          timeoutMs: 30000
        },
        expectedOutputSchema: 'webVerificationResultSchema',
        status: 'completed',
        summary: 'Captured an official announcement source.',
        createdAt: '2026-03-30T00:01:00.000Z',
        completedAt: '2026-03-30T00:01:40.000Z'
      }
    ]
  }
}

function buildThreadDetail() {
  return {
    threadId: 'thread-main-1',
    objectiveId: 'objective-1',
    parentThreadId: null,
    threadKind: 'main',
    ownerRole: 'workspace',
    title: 'Verify an external claim before responding · Main Thread',
    status: 'open',
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:05:00.000Z',
    closedAt: null,
    participants: buildObjectiveDetail().participants,
    messages: [
      {
        messageId: 'message-1',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        fromParticipantId: 'workspace',
        toParticipantId: null,
        kind: 'goal',
        body: 'Check the source before we answer the user.',
        refs: [],
        replyToMessageId: null,
        round: 1,
        confidence: null,
        blocking: false,
        createdAt: '2026-03-30T00:00:00.000Z'
      },
      {
        messageId: 'message-2',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        fromParticipantId: 'governance',
        toParticipantId: null,
        kind: 'challenge',
        body: 'Need stronger evidence before this can proceed.',
        refs: [],
        replyToMessageId: null,
        round: 2,
        confidence: null,
        blocking: true,
        createdAt: '2026-03-30T00:02:00.000Z'
      }
    ],
    proposals: buildObjectiveDetail().proposals,
    votes: [],
    checkpoints: buildObjectiveDetail().checkpoints,
    subagents: buildObjectiveDetail().subagents
  }
}

describe('ObjectiveWorkbenchPage', () => {
  it('renders the objective inbox, checkpoint timeline, and collapsed full thread detail', async () => {
    const listAgentObjectives = vi.fn().mockResolvedValue([buildObjectiveSummary()])
    const getAgentObjective = vi.fn().mockResolvedValue(buildObjectiveDetail())
    const getAgentThread = vi.fn().mockResolvedValue(buildThreadDetail())

    installArchiveApi({
      listAgentObjectives,
      getAgentObjective,
      getAgentThread
    })

    render(<ObjectiveWorkbenchPage />)

    expect(await screen.findByRole('heading', { name: 'Objective Workbench' })).toBeInTheDocument()
    expect(await screen.findByText('Verify an external claim before responding')).toBeInTheDocument()
    expect(screen.getByText('Key checkpoints')).toBeInTheDocument()
    expect(await screen.findByText('Governance requested a bounded verification policy.')).toBeInTheDocument()
    expect(screen.getByText('Agent stances')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show full thread detail' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide full thread detail' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show full thread detail' }))

    expect((await screen.findAllByText('Need stronger evidence before this can proceed.')).length).toBeGreaterThan(0)
    expect(listAgentObjectives).toHaveBeenCalledWith()
    expect(getAgentObjective).toHaveBeenCalledWith({
      objectiveId: 'objective-1'
    })
    expect(getAgentThread).toHaveBeenCalledWith({
      threadId: 'thread-main-1'
    })
  })

  it('exposes proposal actions for challenge and operator confirmation', async () => {
    const respondToAgentProposal = vi.fn().mockResolvedValue({
      ...buildObjectiveDetail().proposals[0],
      status: 'challenged'
    })
    const confirmAgentProposal = vi.fn().mockResolvedValue({
      ...buildObjectiveDetail().proposals[1],
      status: 'committed',
      committedAt: '2026-03-30T00:06:00.000Z'
    })

    installArchiveApi({
      listAgentObjectives: vi.fn().mockResolvedValue([buildObjectiveSummary()]),
      getAgentObjective: vi.fn().mockResolvedValue(buildObjectiveDetail()),
      getAgentThread: vi.fn().mockResolvedValue(buildThreadDetail()),
      respondToAgentProposal,
      confirmAgentProposal
    })

    render(<ObjectiveWorkbenchPage />)

    await screen.findByRole('heading', { name: 'Objective Workbench' })

    fireEvent.click(await screen.findByRole('button', { name: 'Challenge as governance' }))
    await waitFor(() => {
      expect(respondToAgentProposal).toHaveBeenCalledWith({
        proposalId: 'proposal-1',
        responderRole: 'governance',
        response: 'challenge',
        comment: 'Need stronger evidence before this can proceed.'
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm proposal' }))
    await waitFor(() => {
      expect(confirmAgentProposal).toHaveBeenCalledWith({
        proposalId: 'proposal-2',
        decision: 'confirm',
        operatorNote: 'Operator confirmed after reviewing the checkpoint summary.'
      })
    })
  })
})
