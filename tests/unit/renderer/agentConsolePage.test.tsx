import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from './testing-library'
import App from '../../../src/renderer/App'
import { AgentConsolePage } from '../../../src/renderer/pages/AgentConsolePage'

function buildRunRecord(overrides?: Partial<Record<string, unknown>>) {
  return {
    runId: 'run-1',
    role: 'orchestrator',
    taskKind: 'review.summarize_queue',
    targetRole: 'review',
    assignedRoles: ['orchestrator', 'review'],
    latestAssistantResponse: '1 pending items across 1 conflict groups.',
    status: 'completed',
    executionOrigin: 'operator_manual',
    prompt: 'Summarize the highest-priority pending review work',
    confirmationToken: null,
    policyVersion: null,
    errorMessage: null,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...overrides
  }
}

function buildRunDetail(overrides?: Partial<Record<string, unknown>>) {
  return {
    ...buildRunRecord(overrides),
    messages: [
      {
        messageId: 'message-1',
        runId: 'run-1',
        ordinal: 1,
        sender: 'system',
        content: 'Orchestrator delegated review.summarize_queue to review.',
        createdAt: '2026-03-29T00:00:00.000Z'
      },
      {
        messageId: 'message-2',
        runId: 'run-1',
        ordinal: 2,
        sender: 'agent',
        content: '1 pending items across 1 conflict groups.',
        createdAt: '2026-03-29T00:00:01.000Z'
      }
    ],
    ...overrides
  }
}

function buildExecutionPreview(overrides?: Partial<Record<string, unknown>>) {
  return {
    taskKind: 'review.summarize_queue',
    targetRole: 'review',
    assignedRoles: ['orchestrator', 'review'],
    requiresConfirmation: false,
    ...overrides
  }
}

function buildSuggestion(overrides?: Partial<Record<string, unknown>>) {
  return {
    suggestionId: 'suggestion-1',
    triggerKind: 'governance.failed_runs_detected',
    status: 'suggested',
    role: 'governance',
    taskKind: 'governance.summarize_failures',
    taskInput: {
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      prompt: 'Summarize failed agent runs from the proactive monitor.'
    },
    dedupeKey: 'governance.failed-runs::latest',
    sourceRunId: 'run-failed-1',
    executedRunId: null,
    priority: 'medium',
    rationale: 'Failed agent runs were detected and should be summarized.',
    autoRunnable: true,
    followUpOfSuggestionId: null,
    attemptCount: 0,
    cooldownUntil: null,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
    lastObservedAt: '2026-03-30T00:00:00.000Z',
    ...overrides
  }
}

function buildArchiveApi(overrides: Record<string, unknown> = {}) {
  return {
    createAgentObjective: vi.fn().mockResolvedValue({
      objectiveId: '',
      title: '',
      objectiveKind: 'evidence_investigation',
      status: 'in_progress',
      prompt: '',
      initiatedBy: 'operator',
      ownerRole: 'workspace',
      mainThreadId: '',
      riskLevel: 'medium',
      budget: null,
      requiresOperatorInput: false,
      createdAt: '',
      updatedAt: '',
      threads: [],
      participants: [],
      proposals: [],
      checkpoints: [],
      subagents: []
    }),
    listAgentObjectives: vi.fn().mockResolvedValue([]),
    getAgentObjective: vi.fn().mockResolvedValue(null),
    getAgentThread: vi.fn().mockResolvedValue(null),
    respondToAgentProposal: vi.fn().mockResolvedValue(null),
    confirmAgentProposal: vi.fn().mockResolvedValue(null),
    listAgentRuns: vi.fn().mockResolvedValue([]),
    getAgentRun: vi.fn().mockResolvedValue(null),
    previewAgentTask: vi.fn().mockResolvedValue(buildExecutionPreview()),
    runAgentTask: vi.fn().mockResolvedValue({
      runId: '',
      status: 'queued',
      targetRole: null,
      assignedRoles: [],
      latestAssistantResponse: null
    }),
    listAgentMemories: vi.fn().mockResolvedValue([]),
    listAgentPolicyVersions: vi.fn().mockResolvedValue([]),
    listAgentSuggestions: vi.fn().mockResolvedValue([]),
    refreshAgentSuggestions: vi.fn().mockResolvedValue([]),
    dismissAgentSuggestion: vi.fn().mockResolvedValue(null),
    runAgentSuggestion: vi.fn().mockResolvedValue(null),
    getAgentRuntimeSettings: vi.fn().mockResolvedValue({
      settingsId: 'default',
      autonomyMode: 'manual_only',
      updatedAt: '2026-03-30T00:00:00.000Z'
    }),
    updateAgentRuntimeSettings: vi.fn().mockResolvedValue({
      settingsId: 'default',
      autonomyMode: 'suggest_safe_auto_run',
      updatedAt: '2026-03-30T00:05:00.000Z'
    }),
    ...overrides
  }
}

afterEach(() => {
  Reflect.deleteProperty(window, 'archiveApi')
  vi.unstubAllGlobals()
})

describe('AgentConsolePage', () => {
  it('appears in navigation and opens from the app shell', async () => {
    Object.assign(window, {
      archiveApi: {
        ...buildArchiveApi(),
        listImportBatches: vi.fn().mockResolvedValue([])
      }
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Objective Workbench' }))

    expect(await screen.findByRole('heading', { name: 'Objective Workbench' })).toBeInTheDocument()
  })

  it('renders persisted replay metadata, a chronological timeline, and a previous-run comparison', async () => {
    const currentRun = buildRunRecord()
    const previousComparableRun = buildRunRecord({
      runId: 'run-0',
      createdAt: '2026-03-28T23:50:00.000Z',
      updatedAt: '2026-03-28T23:50:00.000Z',
      latestAssistantResponse: '0 pending items across 0 conflict groups.'
    })
    const runAgentTask = vi.fn().mockResolvedValue({
      runId: 'run-1',
      status: 'completed',
      targetRole: null,
      assignedRoles: [],
      latestAssistantResponse: null
    })
    const previewAgentTask = vi.fn().mockResolvedValue(buildExecutionPreview())
    const listAgentRuns = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        currentRun,
        previousComparableRun
      ])
    const getAgentRun = vi.fn().mockResolvedValue(buildRunDetail({
      messages: [
        {
          messageId: 'message-1',
          runId: 'run-1',
          ordinal: 1,
          sender: 'system',
          content: 'Orchestrator delegated review.summarize_queue to review.',
          createdAt: '2026-03-29T00:00:00.000Z'
        },
        {
          messageId: 'message-2',
          runId: 'run-1',
          ordinal: 2,
          sender: 'tool',
          content: 'Loaded 1 pending workbench items and 1 conflict groups.',
          createdAt: '2026-03-29T00:00:00.500Z'
        },
        {
          messageId: 'message-3',
          runId: 'run-1',
          ordinal: 3,
          sender: 'agent',
          content: '1 pending items across 1 conflict groups.',
          createdAt: '2026-03-29T00:00:01.000Z'
        }
      ]
    }))
    const listAgentMemories = vi.fn().mockResolvedValue([
      {
        memoryId: 'memory-1',
        role: 'review',
        memoryKey: 'review.queue.summary',
        memoryValue: 'Escalate duplicate conflict groups first.',
        createdAt: '2026-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:05.000Z'
      }
    ])
    const listAgentPolicyVersions = vi.fn().mockResolvedValue([
      {
        policyVersionId: 'policy-1',
        role: 'review',
        policyKey: 'governance.review.policy',
        policyBody: 'Require confirmation tokens for destructive review actions.',
        createdAt: '2026-03-29T00:00:06.000Z'
      }
    ])

    Object.assign(window, {
      archiveApi: buildArchiveApi({
        listAgentRuns,
        getAgentRun,
        previewAgentTask,
        runAgentTask,
        listAgentMemories,
        listAgentPolicyVersions
      })
    })

    render(<AgentConsolePage />)

    fireEvent.change(screen.getByLabelText('Agent prompt'), {
      target: { value: 'Summarize the highest-priority pending review work' }
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run agent task' }))
    })

    await waitFor(() => {
      expect(runAgentTask).toHaveBeenCalledWith({
        prompt: 'Summarize the highest-priority pending review work',
        role: 'orchestrator'
      })
    })

    expect((await screen.findAllByText('Status: completed')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Assigned roles: orchestrator, review').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1 pending items across 1 conflict groups.').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Target role: review').length).toBeGreaterThan(0)
    expect(screen.getByText('Compared with previous review run')).toBeInTheDocument()
    expect(screen.getByText('Message timeline')).toBeInTheDocument()
    expect(screen.getByText('Operational memory')).toBeInTheDocument()
    expect(screen.getByText('Policy history')).toBeInTheDocument()
    expect(screen.getByText('review.queue.summary')).toBeInTheDocument()
    expect(screen.getByText('Escalate duplicate conflict groups first.')).toBeInTheDocument()
    expect(screen.getByText('governance.review.policy')).toBeInTheDocument()
    expect(screen.getByText('Require confirmation tokens for destructive review actions.')).toBeInTheDocument()
    expect(screen.getByText('tool')).toBeInTheDocument()
    expect(screen.getByText('agent')).toBeInTheDocument()
    expect(listAgentMemories).toHaveBeenCalledWith({ role: 'review' })
    expect(listAgentPolicyVersions).toHaveBeenCalledWith({ role: 'review' })
  })

  it('shows a confirmation affordance before resubmitting destructive review actions', async () => {
    const runAgentTask = vi.fn().mockResolvedValue({
      runId: 'run-apply-1',
      status: 'completed',
      targetRole: 'review',
      assignedRoles: ['review'],
      latestAssistantResponse: 'Applied safe group group-ready with 2 items.'
    })
    const previewAgentTask = vi.fn().mockResolvedValue(buildExecutionPreview({
      taskKind: 'review.apply_safe_group',
      targetRole: 'review',
      assignedRoles: ['review'],
      requiresConfirmation: true
    }))
    const listAgentRuns = vi.fn().mockResolvedValue([
      buildRunRecord({
        runId: 'run-apply-1',
        role: 'review',
        taskKind: 'review.apply_safe_group',
        targetRole: 'review',
        assignedRoles: ['review'],
        latestAssistantResponse: 'Applied safe group group-ready with 2 items.',
        prompt: 'Approve safe group group-ready'
      })
    ])
    const getAgentRun = vi.fn().mockResolvedValue(buildRunDetail({
      runId: 'run-apply-1',
      role: 'review',
      taskKind: 'review.apply_safe_group',
      prompt: 'Approve safe group group-ready',
      messages: [
        {
          messageId: 'message-apply-1',
          runId: 'run-apply-1',
          ordinal: 1,
          sender: 'agent',
          content: 'Applied safe group group-ready with 2 items.',
          createdAt: '2026-03-29T00:00:01.000Z'
        }
      ]
    }))

    Object.assign(window, {
      archiveApi: buildArchiveApi({
        listAgentRuns,
        getAgentRun,
        previewAgentTask,
        runAgentTask
      })
    })

    render(<AgentConsolePage />)

    fireEvent.change(screen.getByLabelText('Role override'), {
      target: { value: 'review' }
    })
    fireEvent.change(screen.getByLabelText('Agent prompt'), {
      target: { value: 'Approve safe group group-ready' }
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run agent task' }))
    })

    expect(runAgentTask).not.toHaveBeenCalled()
    expect(await screen.findByText('Confirmation token required before applying this review action.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Confirmation token'), {
      target: { value: 'token-1' }
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run confirmed action' }))
    })

    await waitFor(() => {
      expect(runAgentTask).toHaveBeenCalledWith({
        prompt: 'Approve safe group group-ready',
        role: 'review',
        taskKind: 'review.apply_safe_group',
        confirmationToken: 'token-1'
      })
    })
  })

  it('shows an execution preview before submit and flags confirmation-gated work', async () => {
    const previewAgentTask = vi.fn().mockResolvedValue(buildExecutionPreview({
      taskKind: 'review.apply_safe_group',
      targetRole: 'review',
      assignedRoles: ['review'],
      requiresConfirmation: true
    }))

    Object.assign(window, {
      archiveApi: buildArchiveApi({
        previewAgentTask,
        runAgentTask: vi.fn()
      })
    })

    render(<AgentConsolePage />)

    fireEvent.change(screen.getByLabelText('Role override'), {
      target: { value: 'review' }
    })
    fireEvent.change(screen.getByLabelText('Agent prompt'), {
      target: { value: 'Approve safe group group-ready' }
    })

    expect(await screen.findByText('Execution preview')).toBeInTheDocument()
    expect(screen.getByText('Task kind: review.apply_safe_group')).toBeInTheDocument()
    expect(screen.getByText('Target role: review')).toBeInTheDocument()
    expect(screen.getByText('Assigned roles: review')).toBeInTheDocument()
    expect(screen.getByText('Requires confirmation before execution.')).toBeInTheDocument()
    expect(previewAgentTask).toHaveBeenCalledWith({
      prompt: 'Approve safe group group-ready',
      role: 'review',
      taskKind: 'review.apply_safe_group'
    })
  })

  it('renders a proactive inbox and lets operators refresh, run, and dismiss suggestions', async () => {
    const dismissableSuggestion = buildSuggestion({
      suggestionId: 'suggestion-dismiss',
      triggerKind: 'ingestion.failed_enrichment_job',
      role: 'ingestion',
      taskKind: 'ingestion.rerun_enrichment',
      taskInput: {
        role: 'ingestion',
        taskKind: 'ingestion.rerun_enrichment',
        prompt: 'Rerun failed enrichment job job-1 for file source.pdf.'
      },
      dedupeKey: 'ingestion.failed-enrichment::job-1',
      sourceRunId: null
    })
    const runnableSuggestion = buildSuggestion({
      suggestionId: 'suggestion-run',
      taskInput: {
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        prompt: 'Summarize failed agent runs from the proactive monitor.'
      }
    })
    const completedRun = buildRunRecord({
      runId: 'run-suggestion-1',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      targetRole: 'governance',
      assignedRoles: ['governance'],
      latestAssistantResponse: '1 failed runs need review.',
      prompt: 'Summarize failed agent runs from the proactive monitor.'
    })
    const listAgentSuggestions = vi.fn()
      .mockResolvedValueOnce([dismissableSuggestion])
      .mockResolvedValueOnce([runnableSuggestion, dismissableSuggestion])
      .mockResolvedValueOnce([dismissableSuggestion])
      .mockResolvedValueOnce([])
    const refreshAgentSuggestions = vi.fn().mockResolvedValue([runnableSuggestion, dismissableSuggestion])
    const runAgentSuggestion = vi.fn().mockResolvedValue({
      runId: 'run-suggestion-1',
      status: 'completed',
      targetRole: 'governance',
      assignedRoles: ['governance'],
      latestAssistantResponse: '1 failed runs need review.'
    })
    const dismissAgentSuggestion = vi.fn().mockResolvedValue({
      ...dismissableSuggestion,
      status: 'dismissed'
    })
    const listAgentRuns = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([completedRun])
    const getAgentRun = vi.fn().mockResolvedValue(buildRunDetail({
      runId: 'run-suggestion-1',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      targetRole: 'governance',
      assignedRoles: ['governance'],
      latestAssistantResponse: '1 failed runs need review.',
      prompt: 'Summarize failed agent runs from the proactive monitor.',
      messages: [
        {
          messageId: 'message-governance-1',
          runId: 'run-suggestion-1',
          ordinal: 1,
          sender: 'agent',
          content: '1 failed runs need review.',
          createdAt: '2026-03-30T00:00:01.000Z'
        }
      ]
    }))

    Object.assign(window, {
      archiveApi: buildArchiveApi({
        listAgentRuns,
        getAgentRun,
        listAgentSuggestions,
        refreshAgentSuggestions,
        dismissAgentSuggestion,
        runAgentSuggestion
      })
    })

    render(<AgentConsolePage />)

    expect(await screen.findByText('Proactive inbox')).toBeInTheDocument()
    expect(screen.getByText('Rerun failed enrichment job job-1 for file source.pdf.')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh suggestions' }))
    })

    await waitFor(() => {
      expect(refreshAgentSuggestions).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Summarize failed agent runs from the proactive monitor.')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Run suggestion' })[0]!)
    })

    await waitFor(() => {
      expect(runAgentSuggestion).toHaveBeenCalledWith({
        suggestionId: 'suggestion-run'
      })
    })
    expect((await screen.findAllByText('1 failed runs need review.')).length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss suggestion' }))
    })

    await waitFor(() => {
      expect(dismissAgentSuggestion).toHaveBeenCalledWith({
        suggestionId: 'suggestion-dismiss'
      })
    })
    expect(await screen.findByText('No proactive suggestions right now.')).toBeInTheDocument()
  })

  it('routes confirmation-gated suggestions through the existing confirmation affordance', async () => {
    const gatedSuggestion = buildSuggestion({
      suggestionId: 'suggestion-confirm',
      triggerKind: 'review.safe_group_available',
      role: 'review',
      taskKind: 'review.apply_safe_group',
      taskInput: {
        role: 'review',
        taskKind: 'review.apply_safe_group',
        prompt: 'Approve safe group group-ready'
      },
      dedupeKey: 'review.safe-group::group-ready'
    })
    const runAgentSuggestion = vi.fn().mockResolvedValue({
      runId: 'run-confirmed-suggestion',
      status: 'completed',
      targetRole: 'review',
      assignedRoles: ['review'],
      latestAssistantResponse: 'Applied safe group group-ready with 2 items.'
    })
    const listAgentRuns = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        buildRunRecord({
          runId: 'run-confirmed-suggestion',
          role: 'review',
          taskKind: 'review.apply_safe_group',
          targetRole: 'review',
          assignedRoles: ['review'],
          latestAssistantResponse: 'Applied safe group group-ready with 2 items.',
          prompt: 'Approve safe group group-ready'
        })
      ])
    const getAgentRun = vi.fn().mockResolvedValue(buildRunDetail({
      runId: 'run-confirmed-suggestion',
      role: 'review',
      taskKind: 'review.apply_safe_group',
      targetRole: 'review',
      assignedRoles: ['review'],
      latestAssistantResponse: 'Applied safe group group-ready with 2 items.',
      prompt: 'Approve safe group group-ready'
    }))
    const listAgentSuggestions = vi.fn()
      .mockResolvedValueOnce([gatedSuggestion])
      .mockResolvedValueOnce([])

    Object.assign(window, {
      archiveApi: buildArchiveApi({
        listAgentRuns,
        getAgentRun,
        listAgentSuggestions,
        runAgentSuggestion
      })
    })

    render(<AgentConsolePage />)

    expect(await screen.findByText('Approve safe group group-ready')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run suggestion' }))
    })

    expect(runAgentSuggestion).not.toHaveBeenCalled()
    expect(await screen.findByText('Confirmation token required before applying this review action.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Confirmation token'), {
      target: { value: 'token-1' }
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run confirmed action' }))
    })

    await waitFor(() => {
      expect(runAgentSuggestion).toHaveBeenCalledWith({
        suggestionId: 'suggestion-confirm',
        confirmationToken: 'token-1'
      })
    })
  })

  it('shows guided-autonomy controls, metadata, and auto-run audit details', async () => {
    const autoRunHistory = buildRunRecord({
      runId: 'run-auto-1',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      targetRole: 'governance',
      assignedRoles: ['governance'],
      latestAssistantResponse: '0 failed runs need review.',
      executionOrigin: 'auto_runner',
      prompt: 'Summarize failed agent runs from the proactive monitor.'
    })
    const autoRunDetail = buildRunDetail({
      ...autoRunHistory,
      messages: [
        {
          messageId: 'message-auto-1',
          runId: 'run-auto-1',
          ordinal: 1,
          sender: 'agent',
          content: '0 failed runs need review.',
          createdAt: '2026-03-30T00:00:01.000Z'
        }
      ]
    })
    const parentSuggestion = buildSuggestion({
      suggestionId: 'suggestion-parent',
      priority: 'high',
      rationale: 'Repeated enrichment failures are blocking downstream review.',
      autoRunnable: true
    })
    const followupSuggestion = buildSuggestion({
      suggestionId: 'suggestion-followup',
      triggerKind: 'review.safe_group_available',
      role: 'review',
      taskKind: 'review.apply_safe_group',
      taskInput: {
        role: 'review',
        taskKind: 'review.apply_safe_group',
        prompt: 'Apply safe group group-safe-42.'
      },
      dedupeKey: 'review.safe-group::group-safe-42::follow-up',
      priority: 'high',
      rationale: 'The safe group recommendation is ready to apply manually.',
      autoRunnable: false,
      followUpOfSuggestionId: 'suggestion-parent'
    })
    const listAgentRuns = vi.fn().mockResolvedValue([autoRunHistory])
    const getAgentRun = vi.fn().mockResolvedValue(autoRunDetail)
    const listAgentSuggestions = vi.fn().mockResolvedValue([followupSuggestion, parentSuggestion])
    const refreshAgentSuggestions = vi.fn().mockResolvedValue([followupSuggestion, parentSuggestion])
    const updateAgentRuntimeSettings = vi.fn().mockResolvedValue({
      settingsId: 'default',
      autonomyMode: 'suggest_safe_auto_run',
      updatedAt: '2026-03-30T00:05:00.000Z'
    })

    Object.assign(window, {
      archiveApi: buildArchiveApi({
        listAgentRuns,
        getAgentRun,
        listAgentSuggestions,
        refreshAgentSuggestions,
        updateAgentRuntimeSettings
      })
    })

    render(<AgentConsolePage />)

    expect(await screen.findByText('Autonomy mode')).toBeInTheDocument()
    expect(screen.getByDisplayValue('manual_only')).toBeInTheDocument()
    expect((await screen.findAllByText('Priority: high')).length).toBeGreaterThan(0)
    expect(screen.getByText('Rationale: Repeated enrichment failures are blocking downstream review.')).toBeInTheDocument()
    expect(screen.getByText('Auto-run eligible: yes')).toBeInTheDocument()
    expect(screen.getByText('Follow-up of suggestion: suggestion-parent')).toBeInTheDocument()
    expect(screen.getAllByText('Execution origin: auto_runner').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Autonomy mode'), {
      target: { value: 'suggest_safe_auto_run' }
    })

    await waitFor(() => {
      expect(updateAgentRuntimeSettings).toHaveBeenCalledWith({
        autonomyMode: 'suggest_safe_auto_run'
      })
    })

    expect(await screen.findByText('Autonomy mode updated to suggest_safe_auto_run.')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Run suggestion' })[0]!)
    })

    expect(await screen.findByText('Confirmation token required before applying this review action.')).toBeInTheDocument()
  })

  it('picks files and submits a preflighted ingestion import through the agent runtime', async () => {
    const selectImportFiles = vi.fn().mockResolvedValue([
      '/tmp/chat.json',
      '/tmp/unsupported.exe'
    ])
    const preflightImportBatch = vi.fn().mockResolvedValue({
      items: [
        {
          sourcePath: '/tmp/chat.json',
          fileName: 'chat.json',
          extension: 'json',
          normalizedFileName: 'chat.json',
          importKindHint: 'chat',
          isSupported: true,
          status: 'supported'
        },
        {
          sourcePath: '/tmp/unsupported.exe',
          fileName: 'unsupported.exe',
          extension: 'exe',
          normalizedFileName: 'unsupported.exe',
          importKindHint: 'unknown',
          isSupported: false,
          status: 'unsupported'
        }
      ],
      summary: {
        totalCount: 2,
        supportedCount: 1,
        unsupportedCount: 1
      }
    })
    const createImportBatch = vi.fn().mockResolvedValue({
      batchId: 'batch-1',
      sourceLabel: 'Agent Console import',
      createdAt: '2026-03-30T00:00:00.000Z',
      files: [
        {
          fileId: 'file-1',
          fileName: 'chat.json',
          duplicateClass: 'unique',
          parserStatus: 'parsed',
          frozenAbsolutePath: '/tmp/frozen/chat.json'
        }
      ],
      summary: {
        frozenCount: 1,
        parsedCount: 1,
        duplicateCount: 0,
        reviewCount: 0
      }
    })
    const runAgentTask = vi.fn()
    const previewAgentTask = vi.fn().mockResolvedValue(buildExecutionPreview({
      taskKind: 'ingestion.import_batch',
      targetRole: 'ingestion',
      assignedRoles: ['ingestion'],
      requiresConfirmation: false
    }))
    const listAgentRuns = vi.fn().mockResolvedValue([])
    const getAgentRun = vi.fn().mockResolvedValue(null)

    Object.assign(window, {
      archiveApi: buildArchiveApi({
        selectImportFiles,
        preflightImportBatch,
        createImportBatch,
        listAgentRuns,
        getAgentRun,
        previewAgentTask,
        runAgentTask
      })
    })

    render(<AgentConsolePage />)

    fireEvent.change(screen.getByLabelText('Role override'), {
      target: { value: 'ingestion' }
    })
    fireEvent.change(screen.getByLabelText('Agent prompt'), {
      target: { value: 'Import these files into the archive' }
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run agent task' }))
    })

    await waitFor(() => {
      expect(selectImportFiles).toHaveBeenCalledTimes(1)
    })
    expect(preflightImportBatch).toHaveBeenCalledWith({
      sourcePaths: ['/tmp/chat.json', '/tmp/unsupported.exe']
    })
    await waitFor(() => {
      expect(createImportBatch).toHaveBeenCalledWith({
        sourcePaths: ['/tmp/chat.json'],
        sourceLabel: 'Agent Console import'
      })
    })
    expect(runAgentTask).not.toHaveBeenCalled()
    expect(screen.getByText('1 supported, 1 unsupported')).toBeInTheDocument()
    expect(screen.getByText('Import batch batch-1 created with 1 imported files.')).toBeInTheDocument()
  })
})
