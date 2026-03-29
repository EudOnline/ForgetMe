import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from './testing-library'
import App from '../../../src/renderer/App'
import { AgentConsolePage } from '../../../src/renderer/pages/AgentConsolePage'

function buildRunRecord(overrides?: Partial<Record<string, unknown>>) {
  return {
    runId: 'run-1',
    role: 'orchestrator',
    taskKind: null,
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
        runAgentTask: vi.fn().mockResolvedValue({ runId: '', status: 'queued' })
      }
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Agent Console' }))

    expect(await screen.findByRole('heading', { name: 'Agent Console' })).toBeInTheDocument()
  })

  it('submits prompts and renders run status, assigned roles, and the latest assistant response', async () => {
    const runAgentTask = vi.fn().mockResolvedValue({
      runId: 'run-1',
      status: 'completed',
      assignedRoles: ['orchestrator', 'review']
    })
    const listAgentRuns = vi.fn().mockResolvedValue([
      buildRunRecord()
    ])
    const getAgentRun = vi.fn().mockResolvedValue(buildRunDetail())

    Object.assign(window, {
      archiveApi: {
        listAgentRuns,
        getAgentRun,
        runAgentTask
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
  })

  it('shows a confirmation affordance before resubmitting destructive review actions', async () => {
    const runAgentTask = vi.fn().mockResolvedValue({
      runId: 'run-apply-1',
      status: 'completed',
      assignedRoles: ['review']
    })
    const listAgentRuns = vi.fn().mockResolvedValue([
      buildRunRecord({
        runId: 'run-apply-1',
        role: 'review',
        taskKind: 'review.apply_safe_group',
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
        runAgentTask
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
})
