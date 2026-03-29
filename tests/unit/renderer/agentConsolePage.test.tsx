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

afterEach(() => {
  Reflect.deleteProperty(window, 'archiveApi')
  vi.unstubAllGlobals()
})

describe('AgentConsolePage', () => {
  it('appears in navigation and opens from the app shell', async () => {
    Object.assign(window, {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        listAgentRuns: vi.fn().mockResolvedValue([]),
        getAgentRun: vi.fn().mockResolvedValue(null),
        listAgentMemories: vi.fn().mockResolvedValue([]),
        listAgentPolicyVersions: vi.fn().mockResolvedValue([]),
        runAgentTask: vi.fn().mockResolvedValue({
          runId: '',
          status: 'queued',
          targetRole: null,
          assignedRoles: [],
          latestAssistantResponse: null
        })
      }
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Agent Console' }))

    expect(await screen.findByRole('heading', { name: 'Agent Console' })).toBeInTheDocument()
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
      archiveApi: {
        listAgentRuns,
        getAgentRun,
        runAgentTask,
        listAgentMemories,
        listAgentPolicyVersions
      }
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
    expect(screen.getByText('Target role: review')).toBeInTheDocument()
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
      archiveApi: {
        listAgentRuns,
        getAgentRun,
        runAgentTask,
        listAgentMemories: vi.fn().mockResolvedValue([]),
        listAgentPolicyVersions: vi.fn().mockResolvedValue([])
      }
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
    const listAgentRuns = vi.fn().mockResolvedValue([])
    const getAgentRun = vi.fn().mockResolvedValue(null)

    Object.assign(window, {
      archiveApi: {
        selectImportFiles,
        preflightImportBatch,
        createImportBatch,
        listAgentRuns,
        getAgentRun,
        runAgentTask,
        listAgentMemories: vi.fn().mockResolvedValue([]),
        listAgentPolicyVersions: vi.fn().mockResolvedValue([])
      }
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
