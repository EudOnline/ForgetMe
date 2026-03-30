import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppPaths } from '../../../src/main/services/appPaths'

const {
  handlerMap,
  openDatabase,
  runMigrations,
  createAgentRuntime,
  createIngestionAgentService,
  createReviewAgentService,
  createWorkspaceAgentService,
  createGovernanceAgentService
} = vi.hoisted(() => ({
  handlerMap: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>(),
  openDatabase: vi.fn(),
  runMigrations: vi.fn(),
  createAgentRuntime: vi.fn(),
  createIngestionAgentService: vi.fn(),
  createReviewAgentService: vi.fn(),
  createWorkspaceAgentService: vi.fn(),
  createGovernanceAgentService: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: vi.fn((channel: string) => {
      handlerMap.delete(channel)
    }),
    handle: vi.fn((channel: string, handler: (event: unknown, payload?: unknown) => Promise<unknown>) => {
      handlerMap.set(channel, handler)
    })
  }
}))

vi.mock('../../../src/main/services/db', () => ({
  openDatabase,
  runMigrations
}))

vi.mock('../../../src/main/services/agentRuntimeService', () => ({
  createAgentRuntime
}))

vi.mock('../../../src/main/services/agents/ingestionAgentService', () => ({
  createIngestionAgentService
}))

vi.mock('../../../src/main/services/agents/reviewAgentService', () => ({
  createReviewAgentService
}))

vi.mock('../../../src/main/services/agents/workspaceAgentService', () => ({
  createWorkspaceAgentService
}))

vi.mock('../../../src/main/services/agents/governanceAgentService', () => ({
  createGovernanceAgentService
}))

import { registerAgentIpc } from '../../../src/main/ipc/agentIpc'

function appPathsFixture(): AppPaths {
  return {
    root: '/tmp/forgetme',
    sqliteDir: '/tmp/forgetme/sqlite',
    vaultDir: '/tmp/forgetme/vault',
    vaultOriginalsDir: '/tmp/forgetme/vault/originals',
    importReportsDir: '/tmp/forgetme/reports',
    preservationReportsDir: '/tmp/forgetme/preservation-reports'
  }
}

describe('registerAgentIpc', () => {
  beforeEach(() => {
    handlerMap.clear()
    openDatabase.mockReset()
    runMigrations.mockReset()
    createAgentRuntime.mockReset()
    createIngestionAgentService.mockReset()
    createReviewAgentService.mockReset()
    createWorkspaceAgentService.mockReset()
    createGovernanceAgentService.mockReset()
  })

  it('registers agent runtime handlers and wires runAgentTask through the runtime', async () => {
    const close = vi.fn()
    const db = { close }
    const ingestionAdapter = { role: 'ingestion' }
    const reviewAdapter = { role: 'review' }
    const workspaceAdapter = { role: 'workspace' }
    const governanceAdapter = { role: 'governance' }
    const runtime = {
      previewTask: vi.fn().mockReturnValue({
        taskKind: 'review.apply_item_decision',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        requiresConfirmation: true
      }),
      runTask: vi.fn().mockResolvedValue({
        runId: 'run-1',
        status: 'completed',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        latestAssistantResponse: '1 pending items across 1 conflict groups.'
      }),
      listRuns: vi.fn(),
      getRun: vi.fn(),
      listMemories: vi.fn(),
      listPolicyVersions: vi.fn()
    }

    openDatabase.mockReturnValue(db)
    createIngestionAgentService.mockReturnValue(ingestionAdapter)
    createReviewAgentService.mockReturnValue(reviewAdapter)
    createWorkspaceAgentService.mockReturnValue(workspaceAdapter)
    createGovernanceAgentService.mockReturnValue(governanceAdapter)
    createAgentRuntime.mockReturnValue(runtime)

    registerAgentIpc(appPathsFixture())

    expect(handlerMap.has('archive:runAgentTask')).toBe(true)
    expect(handlerMap.has('archive:previewAgentTask')).toBe(true)
    expect(handlerMap.has('archive:listAgentRuns')).toBe(true)
    expect(handlerMap.has('archive:getAgentRun')).toBe(true)
    expect(handlerMap.has('archive:listAgentMemories')).toBe(true)
    expect(handlerMap.has('archive:listAgentPolicyVersions')).toBe(true)

    const result = await handlerMap.get('archive:runAgentTask')?.({}, {
      prompt: 'Summarize the highest-priority pending review work',
      role: 'orchestrator'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalledWith(db)
    expect(createIngestionAgentService).toHaveBeenCalledTimes(1)
    expect(createReviewAgentService).toHaveBeenCalledTimes(1)
    expect(createWorkspaceAgentService).toHaveBeenCalledTimes(1)
    expect(createGovernanceAgentService).toHaveBeenCalledTimes(1)
    expect(createAgentRuntime).toHaveBeenCalledWith({
      db,
      adapters: [ingestionAdapter, reviewAdapter, workspaceAdapter, governanceAdapter]
    })
    expect(runtime.runTask).toHaveBeenCalledWith({
      prompt: 'Summarize the highest-priority pending review work',
      role: 'orchestrator'
    })
    expect(result).toEqual({
      runId: 'run-1',
      status: 'completed',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      latestAssistantResponse: '1 pending items across 1 conflict groups.'
    })
    expect(close).toHaveBeenCalled()
  })

  it('returns persisted run and memory reads through the runtime', async () => {
    const close = vi.fn()
    const db = { close }
    const runtime = {
      runTask: vi.fn(),
      previewTask: vi.fn().mockReturnValue({
        taskKind: 'review.apply_item_decision',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        requiresConfirmation: true
      }),
      listRuns: vi.fn().mockReturnValue([
        {
          runId: 'run-1',
          role: 'review',
          taskKind: 'review.summarize_queue',
          targetRole: 'review',
          assignedRoles: ['orchestrator', 'review'],
          latestAssistantResponse: '1 pending items across 1 conflict groups.',
          status: 'completed',
          prompt: 'Summarize queue',
          confirmationToken: null,
          policyVersion: null,
          errorMessage: null,
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z'
        }
      ]),
      getRun: vi.fn().mockReturnValue({
        runId: 'run-1',
        role: 'review',
        taskKind: 'review.summarize_queue',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        latestAssistantResponse: '1 pending items across 1 conflict groups.',
        status: 'completed',
        prompt: 'Summarize queue',
        confirmationToken: null,
        policyVersion: null,
        errorMessage: null,
        createdAt: '2026-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:00.000Z',
        messages: []
      }),
      listMemories: vi.fn().mockReturnValue([
        {
          memoryId: 'memory-1',
          role: 'governance',
          memoryKey: 'governance.feedback',
          memoryValue: 'Prefer queue summaries first.',
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z'
        }
      ]),
      listPolicyVersions: vi.fn().mockReturnValue([
        {
          policyVersionId: 'policy-1',
          role: 'governance',
          policyKey: 'governance.review.policy',
          policyBody: 'Always summarize recent failures before proposing a new policy.',
          createdAt: '2026-03-29T00:00:02.000Z'
        }
      ])
    }

    openDatabase.mockReturnValue(db)
    createIngestionAgentService.mockReturnValue({ role: 'ingestion' })
    createReviewAgentService.mockReturnValue({ role: 'review' })
    createWorkspaceAgentService.mockReturnValue({ role: 'workspace' })
    createGovernanceAgentService.mockReturnValue({ role: 'governance' })
    createAgentRuntime.mockReturnValue(runtime)

    registerAgentIpc(appPathsFixture())

    const preview = await handlerMap.get('archive:previewAgentTask')?.({}, {
      prompt: 'Approve review item rq-1',
      role: 'orchestrator'
    })
    const runs = await handlerMap.get('archive:listAgentRuns')?.({}, { role: 'review', limit: 5 })
    const detail = await handlerMap.get('archive:getAgentRun')?.({}, { runId: 'run-1' })
    const memories = await handlerMap.get('archive:listAgentMemories')?.({}, { role: 'governance' })
    const policyVersions = await handlerMap.get('archive:listAgentPolicyVersions')?.({}, {
      role: 'governance',
      policyKey: 'governance.review.policy'
    })

    expect(runtime.previewTask).toHaveBeenCalledWith({
      prompt: 'Approve review item rq-1',
      role: 'orchestrator'
    })
    expect(preview).toEqual({
      taskKind: 'review.apply_item_decision',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      requiresConfirmation: true
    })
    expect(runtime.listRuns).toHaveBeenCalledWith({ role: 'review', limit: 5 })
    expect(runtime.getRun).toHaveBeenCalledWith({ runId: 'run-1' })
    expect(runtime.listMemories).toHaveBeenCalledWith({ role: 'governance' })
    expect(runtime.listPolicyVersions).toHaveBeenCalledWith({
      role: 'governance',
      policyKey: 'governance.review.policy'
    })
    expect(runs).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        role: 'review',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        latestAssistantResponse: '1 pending items across 1 conflict groups.'
      })
    ])
    expect(detail).toEqual(expect.objectContaining({
      runId: 'run-1',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      latestAssistantResponse: '1 pending items across 1 conflict groups.',
      messages: []
    }))
    expect(memories).toEqual([
      expect.objectContaining({
        memoryId: 'memory-1',
        role: 'governance'
      })
    ])
    expect(policyVersions).toEqual([
      expect.objectContaining({
        policyVersionId: 'policy-1',
        role: 'governance',
        policyKey: 'governance.review.policy'
      })
    ])
    expect(close).toHaveBeenCalledTimes(5)
  })
})
