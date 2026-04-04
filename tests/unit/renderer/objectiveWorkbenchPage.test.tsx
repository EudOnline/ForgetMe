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

function buildOperatorAttentionObjectiveSummary() {
  return {
    ...buildObjectiveSummary(),
    objectiveId: 'objective-2',
    title: 'Review a public publication gate',
    objectiveKind: 'publication',
    status: 'awaiting_operator',
    ownerRole: 'workspace',
    riskLevel: 'high',
    requiresOperatorInput: true
  }
}

function buildConvergedInboxSummaryWithCounts() {
  return {
    ...buildOperatorAttentionObjectiveSummary(),
    requiresOperatorInput: false,
    awaitingOperatorCount: 1,
    blockedCount: 1,
    vetoedCount: 1,
    criticalProposalCount: 1,
    latestBlocker: 'Blocked by governance: Governance veto pending policy alignment.'
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
        proposalRiskLevel: 'critical',
        autonomyDecision: 'await_operator',
        riskReasons: ['public_distribution_boundary'],
        confidenceScore: 0.94,
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
        proposalRiskLevel: 'high',
        autonomyDecision: 'auto_commit_with_audit',
        riskReasons: ['reversible_local_state_change'],
        confidenceScore: 0.81,
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
    ],
    toolExecutions: [
      {
        toolExecutionId: 'tool-execution-1',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        proposalId: 'proposal-1',
        requestedByParticipantId: 'subagent-1',
        toolName: 'search_web',
        toolPolicyId: 'external-verification-policy',
        status: 'completed',
        inputPayload: {
          query: 'official announcement date'
        },
        outputPayload: {
          resultCount: 1
        },
        artifactRefs: [],
        createdAt: '2026-03-30T00:01:10.000Z',
        completedAt: '2026-03-30T00:01:15.000Z'
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
    subagents: buildObjectiveDetail().subagents,
    toolExecutions: buildObjectiveDetail().toolExecutions
  }
}

function buildStalledObjectiveDetail() {
  return {
    ...buildObjectiveDetail(),
    status: 'stalled',
    requiresOperatorInput: false,
    checkpoints: [
      ...buildObjectiveDetail().checkpoints,
      {
        checkpointId: 'checkpoint-4',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        checkpointKind: 'stalled',
        title: 'Objective stalled',
        summary: 'Facilitator paused deliberation after repeated idle rounds without new artifacts.',
        relatedMessageId: null,
        relatedProposalId: null,
        artifactRefs: [],
        createdAt: '2026-03-30T00:06:00.000Z'
      }
    ]
  }
}

function buildWaitingThreadDetail() {
  return {
    ...buildThreadDetail(),
    status: 'waiting'
  }
}

function buildCompletedObjectiveDetail() {
  return {
    ...buildObjectiveDetail(),
    status: 'completed',
    checkpoints: [
      ...buildObjectiveDetail().checkpoints,
      {
        checkpointId: 'checkpoint-4',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        checkpointKind: 'user_facing_result_prepared',
        title: 'Objective completed',
        summary: 'Facilitator marked the objective complete after convergence on a user-facing result.',
        relatedMessageId: 'message-3',
        relatedProposalId: null,
        artifactRefs: [],
        createdAt: '2026-03-30T00:06:00.000Z'
      }
    ]
  }
}

function buildCompletedThreadDetail() {
  return {
    ...buildThreadDetail(),
    status: 'completed',
    messages: [
      ...buildThreadDetail().messages,
      {
        messageId: 'message-3',
        objectiveId: 'objective-1',
        threadId: 'thread-main-1',
        fromParticipantId: 'workspace',
        toParticipantId: null,
        kind: 'final_response',
        body: 'The official source confirms the announcement date.',
        refs: [],
        replyToMessageId: null,
        round: 3,
        confidence: 0.92,
        blocking: false,
        createdAt: '2026-03-30T00:06:00.000Z'
      }
    ],
    checkpoints: buildCompletedObjectiveDetail().checkpoints
  }
}

function buildRuntimeScorecard() {
  return {
    totalProposalCount: 4,
    autoCommitCount: 2,
    operatorGatedCount: 1,
    vetoCount: 1,
    blockedCount: 1,
    totalObjectiveCount: 2,
    stalledObjectiveCount: 1,
    completedObjectiveCount: 1,
    criticalGateRate: 1,
    vetoRate: 0.25,
    blockedRate: 0.25,
    stalledObjectiveRate: 0.5,
    meanRoundsToCompletion: 3.5,
    operatorBacklogSize: 1,
    budgetExhaustedCount: 1,
    toolTimeoutCount: 1,
    warningAlertCount: 1,
    criticalAlertCount: 1,
    backlogDelta24h: 1,
    stalledDelta24h: 1,
    blockedDelta24h: 1,
    autoCommitRateByRiskLevel: {
      low: { total: 0, autoCommitted: 0, rate: null },
      medium: { total: 2, autoCommitted: 2, rate: 1 },
      high: { total: 1, autoCommitted: 0, rate: 0 },
      critical: { total: 1, autoCommitted: 0, rate: 0 }
    }
  }
}

function buildRuntimeEvents() {
  return [
    {
      eventId: 'runtime-event-1',
      objectiveId: 'objective-1',
      threadId: 'thread-main-1',
      proposalId: 'proposal-2',
      eventType: 'proposal_awaiting_operator',
      payload: {
        proposalKind: 'approve_review_item',
        proposalRiskLevel: 'high',
        blocker: 'Waiting for operator confirmation.'
      },
      createdAt: '2026-03-30T00:05:00.000Z'
    },
    {
      eventId: 'runtime-event-2',
      objectiveId: 'objective-1',
      threadId: 'thread-main-1',
      proposalId: 'proposal-1',
      eventType: 'proposal_blocked',
      payload: {
        proposalKind: 'verify_external_claim',
        proposalRiskLevel: 'critical',
        blocker: 'Governance requested stronger evidence.'
      },
      createdAt: '2026-03-30T00:06:00.000Z'
    }
  ]
}

function buildRuntimeAlerts() {
  return [
    {
      alertId: 'runtime-alert-1',
      fingerprint: 'objective_stalled:objective-1',
      severity: 'critical',
      status: 'open',
      objectiveId: 'objective-1',
      proposalId: null,
      firstEventId: 'runtime-event-1',
      latestEventId: 'runtime-event-2',
      eventCount: 2,
      title: 'Repeated stalled objective',
      detail: 'The same objective stalled twice within the active lookback window.',
      openedAt: '2026-04-04T03:00:00.000Z',
      lastSeenAt: '2026-04-04T03:05:00.000Z',
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null
    }
  ]
}

function buildRuntimeSettings() {
  return {
    disableAutoCommit: false,
    forceOperatorForExternalActions: true,
    disableNestedDelegation: false,
    updatedAt: '2026-03-30T00:06:00.000Z',
    updatedBy: 'operator'
  }
}

describe('ObjectiveWorkbenchPage', () => {
  it('refreshes native objective triggers before loading the objective inbox', async () => {
    const refreshObjectiveTriggers = vi.fn().mockResolvedValue([])
    const listAgentObjectives = vi.fn().mockResolvedValue([buildObjectiveSummary()])
    const getAgentObjective = vi.fn().mockResolvedValue(buildObjectiveDetail())
    const getAgentThread = vi.fn().mockResolvedValue(buildThreadDetail())

    installArchiveApi({
      refreshObjectiveTriggers,
      listAgentObjectives,
      getAgentObjective,
      getAgentThread
    })

    render(<ObjectiveWorkbenchPage />)

    await screen.findByRole('heading', { name: 'Objective Workbench' })

    expect(refreshObjectiveTriggers).toHaveBeenCalledWith()
    expect(listAgentObjectives).toHaveBeenCalledWith()
    expect(refreshObjectiveTriggers.mock.invocationCallOrder[0]).toBeLessThan(listAgentObjectives.mock.invocationCallOrder[0])
  })

  it('renders the objective inbox, checkpoint timeline, and collapsed full thread detail', async () => {
    const listAgentObjectives = vi.fn().mockResolvedValue([
      buildObjectiveSummary(),
      buildOperatorAttentionObjectiveSummary()
    ])
    const getAgentObjective = vi.fn().mockResolvedValue(buildObjectiveDetail())
    const getAgentThread = vi.fn().mockResolvedValue(buildThreadDetail())

    installArchiveApi({
      refreshObjectiveTriggers: vi.fn().mockResolvedValue([]),
      listAgentObjectives,
      getAgentObjective,
      getAgentThread
    })

    render(<ObjectiveWorkbenchPage />)

    expect(await screen.findByRole('heading', { name: 'Objective Workbench' })).toBeInTheDocument()
    expect(await screen.findByText('Verify an external claim before responding')).toBeInTheDocument()
    expect(screen.getByText('Medium risk')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Review a public publication gate/ })
    ).toHaveTextContent('High risk')
    expect(
      screen.getByRole('button', { name: /Review a public publication gate/ })
    ).toHaveTextContent('Needs operator')
    expect(screen.getByText('Key checkpoints')).toBeInTheDocument()
    expect((await screen.findAllByText('Governance requested a bounded verification policy.')).length).toBeGreaterThan(0)
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

  it('shows row-level inbox status pills from summary diagnostics and derived operator gating', async () => {
    installArchiveApi({
      refreshObjectiveTriggers: vi.fn().mockResolvedValue([]),
      listAgentObjectives: vi.fn().mockResolvedValue([
        buildObjectiveSummary(),
        buildConvergedInboxSummaryWithCounts()
      ]),
      getAgentObjective: vi.fn().mockResolvedValue(buildObjectiveDetail()),
      getAgentThread: vi.fn().mockResolvedValue(buildThreadDetail())
    })

    render(<ObjectiveWorkbenchPage />)

    await screen.findByRole('heading', { name: 'Objective Workbench' })

    const inboxRow = screen.getByRole('button', { name: /Review a public publication gate/ })

    expect(inboxRow).toHaveTextContent('Needs operator')
    expect(inboxRow).toHaveTextContent('Awaiting operator: 1')
    expect(inboxRow).toHaveTextContent('Blocked: 1')
    expect(inboxRow).toHaveTextContent('Vetoed: 1')
    expect(inboxRow).toHaveTextContent('Latest blocker: Blocked by governance: Governance veto pending policy alignment.')
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
      refreshObjectiveTriggers: vi.fn().mockResolvedValue([]),
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

  it('shows runtime health, recent incidents, and persisted kill switches', async () => {
    const getObjectiveRuntimeScorecard = vi.fn().mockResolvedValue(buildRuntimeScorecard())
    const listObjectiveRuntimeEvents = vi.fn().mockResolvedValue(buildRuntimeEvents())
    const listObjectiveRuntimeAlerts = vi.fn().mockResolvedValue(buildRuntimeAlerts())
    const acknowledgeObjectiveRuntimeAlert = vi.fn().mockResolvedValue({
      ...buildRuntimeAlerts()[0],
      status: 'acknowledged',
      acknowledgedAt: '2026-04-04T03:06:00.000Z',
      acknowledgedBy: 'operator:test'
    })
    const getObjectiveRuntimeSettings = vi.fn().mockResolvedValue(buildRuntimeSettings())
    let resolveRuntimeSettingsUpdate!: (value: {
      disableAutoCommit: boolean
      forceOperatorForExternalActions: boolean
      disableNestedDelegation: boolean
      updatedAt: string
      updatedBy: string
    }) => void
    const updateObjectiveRuntimeSettings = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveRuntimeSettingsUpdate = resolve
    }))

    installArchiveApi({
      refreshObjectiveTriggers: vi.fn().mockResolvedValue([]),
      listAgentObjectives: vi.fn().mockResolvedValue([buildObjectiveSummary()]),
      getAgentObjective: vi.fn().mockResolvedValue(buildObjectiveDetail()),
      getAgentThread: vi.fn().mockResolvedValue(buildThreadDetail()),
      getObjectiveRuntimeScorecard,
      listObjectiveRuntimeEvents,
      listObjectiveRuntimeAlerts,
      acknowledgeObjectiveRuntimeAlert,
      getObjectiveRuntimeSettings,
      updateObjectiveRuntimeSettings
    })

    render(<ObjectiveWorkbenchPage />)

    expect(await screen.findByRole('heading', { name: 'Objective Workbench' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Runtime health' })).toBeInTheDocument()
    expect(screen.getByText('Auto-committed proposals')).toBeInTheDocument()
    expect(screen.getByText('Operator backlog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recent incidents' })).toBeInTheDocument()
    expect(screen.getByText('proposal_blocked')).toBeInTheDocument()
    expect(screen.getByText('Governance requested stronger evidence.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Open alerts' })).toBeInTheDocument()
    expect(screen.getByText('Repeated stalled objective')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Budget pressure' })).toBeInTheDocument()
    expect(screen.getByText('Exhausted budgets')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Trend window' })).toBeInTheDocument()
    expect(screen.getByText('Backlog delta (24h)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Runtime controls' })).toBeInTheDocument()
    expect(screen.getByLabelText('Disable auto commit')).toBeInTheDocument()
    expect(screen.getByLabelText('Force operator for external actions')).toBeInTheDocument()
    expect(screen.getByLabelText('Disable nested delegation')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge alert' }))
    await waitFor(() => {
      expect(acknowledgeObjectiveRuntimeAlert).toHaveBeenCalledWith({
        alertId: 'runtime-alert-1'
      })
    })

    fireEvent.click(screen.getByLabelText('Disable auto commit'))
    expect(screen.getByLabelText('Disable auto commit')).toBeChecked()

    expect(updateObjectiveRuntimeSettings).toHaveBeenCalledWith({
      patch: {
        disableAutoCommit: true
      }
    })

    resolveRuntimeSettingsUpdate({
      ...buildRuntimeSettings(),
      disableAutoCommit: true,
      updatedAt: '2026-03-30T00:07:00.000Z',
      updatedBy: 'operator:test'
    })

    await waitFor(() => {
      expect(screen.getByText('Updated runtime controls.')).toBeInTheDocument()
    })
    expect(getObjectiveRuntimeScorecard).toHaveBeenCalledWith()
    expect(listObjectiveRuntimeEvents).toHaveBeenCalledWith()
    expect(listObjectiveRuntimeAlerts).toHaveBeenCalledWith()
    expect(getObjectiveRuntimeSettings).toHaveBeenCalledWith()
  })

  it('shows proposal provenance, bounded tool policy details, and subagent lineage', async () => {
    installArchiveApi({
      refreshObjectiveTriggers: vi.fn().mockResolvedValue([]),
      listAgentObjectives: vi.fn().mockResolvedValue([buildObjectiveSummary()]),
      getAgentObjective: vi.fn().mockResolvedValue(buildObjectiveDetail()),
      getAgentThread: vi.fn().mockResolvedValue(buildThreadDetail())
    })

    render(<ObjectiveWorkbenchPage />)

    await screen.findByRole('heading', { name: 'Objective Workbench' })

    expect(screen.getByText('Agent source: workspace')).toBeInTheDocument()
    expect(screen.getAllByText('Blocked by governance: Need stronger evidence before this can proceed.').length).toBeGreaterThan(0)
    expect(screen.getByText('Tool executions')).toBeInTheDocument()
    expect(screen.getByText('search_web')).toBeInTheDocument()
    expect(screen.getByText('external-verification-policy')).toBeInTheDocument()
    expect(screen.getAllByText('2 rounds · 3 tools · 30s').length).toBeGreaterThan(0)
    expect(screen.getByText('workspace -> web-verifier')).toBeInTheDocument()
  })

  it('shows facilitator runtime state for stalled objectives and waiting threads', async () => {
    installArchiveApi({
      refreshObjectiveTriggers: vi.fn().mockResolvedValue([]),
      listAgentObjectives: vi.fn().mockResolvedValue([{
        ...buildObjectiveSummary(),
        status: 'stalled'
      }]),
      getAgentObjective: vi.fn().mockResolvedValue(buildStalledObjectiveDetail()),
      getAgentThread: vi.fn().mockResolvedValue(buildWaitingThreadDetail())
    })

    render(<ObjectiveWorkbenchPage />)

    await screen.findByRole('heading', { name: 'Objective Workbench' })

    const runtimeSection = screen.getByRole('region', { name: 'Runtime visibility' })

    expect(runtimeSection).toHaveTextContent('Objective status: stalled')
    expect(runtimeSection).toHaveTextContent('Thread status: waiting')
    expect(runtimeSection).toHaveTextContent('Operator input: none')
    expect(runtimeSection).toHaveTextContent('Facilitator round: 2')
    expect(runtimeSection).toHaveTextContent('Facilitator reason: Facilitator paused deliberation after repeated idle rounds without new artifacts.')
    expect(screen.getAllByText('Facilitator paused deliberation after repeated idle rounds without new artifacts.').length).toBeGreaterThan(0)
  })

  it('shows facilitator convergence reason for completed objectives', async () => {
    installArchiveApi({
      refreshObjectiveTriggers: vi.fn().mockResolvedValue([]),
      listAgentObjectives: vi.fn().mockResolvedValue([{
        ...buildObjectiveSummary(),
        status: 'completed'
      }]),
      getAgentObjective: vi.fn().mockResolvedValue(buildCompletedObjectiveDetail()),
      getAgentThread: vi.fn().mockResolvedValue(buildCompletedThreadDetail())
    })

    render(<ObjectiveWorkbenchPage />)

    await screen.findByRole('heading', { name: 'Objective Workbench' })

    const runtimeSection = screen.getByRole('region', { name: 'Runtime visibility' })

    expect(runtimeSection).toHaveTextContent('Objective status: completed')
    expect(runtimeSection).toHaveTextContent('Thread status: completed')
    expect(runtimeSection).toHaveTextContent('Facilitator round: 3')
    expect(runtimeSection).toHaveTextContent('Facilitator reason: Facilitator marked the objective complete after convergence on a user-facing result.')
  })
})
