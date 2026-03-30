import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentRole, AgentTaskKind, RunAgentTaskInput } from '../../../src/shared/archiveContracts'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createAgentRuntime } from '../../../src/main/services/agentRuntimeService'
import { upsertAgentSuggestion } from '../../../src/main/services/agentPersistenceService'
import type { AgentAdapter } from '../../../src/main/services/agents/agentTypes'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-runtime-service-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('agent runtime service', () => {
  it('routes orchestrator review summaries to the non-destructive queue summary task', async () => {
    const db = setupDatabase()
    const reviewAdapter: AgentAdapter = {
      role: 'review',
      canHandle: (taskKind) => taskKind === 'review.summarize_queue',
      execute: async () => ({
        messages: [
          {
            sender: 'tool',
            content: 'Loaded pending review workbench items'
          },
          {
            sender: 'agent',
            content: '1 pending items across 1 conflict groups.'
          }
        ]
      })
    }

    const runtime = createAgentRuntime({
      db,
      adapters: [reviewAdapter]
    })

    const result = await runtime.runTask({
      prompt: 'Summarize the highest-priority pending review work',
      role: 'orchestrator'
    })
    const detail = runtime.getRun({ runId: result.runId })

    expect(result.status).toBe('completed')
    expect(result.targetRole).toBe('review')
    expect(result.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(result.latestAssistantResponse).toBe('1 pending items across 1 conflict groups.')
    expect(detail?.status).toBe('completed')
    expect(detail?.targetRole).toBe('review')
    expect(detail?.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(detail?.latestAssistantResponse).toBe('1 pending items across 1 conflict groups.')
    expect(detail?.errorMessage).toBeNull()
    expect(detail?.messages.some((message) => message.content.includes('pending review workbench items'))).toBe(true)

    db.close()
  })

  it('creates a persisted run row and delegates orchestrator prompts to a role adapter', async () => {
    const db = setupDatabase()
    const workspaceAdapter: AgentAdapter = {
      role: 'workspace',
      canHandle: (taskKind) => taskKind === 'workspace.ask_memory',
      execute: async () => ({
        messages: [
          {
            sender: 'tool',
            content: 'Loaded workspace context cards'
          },
          {
            sender: 'agent',
            content: 'Workspace answer ready'
          }
        ]
      })
    }

    const runtime = createAgentRuntime({
      db,
      adapters: [workspaceAdapter]
    })

    const result = await runtime.runTask({
      prompt: 'Use the workspace to answer this archive question.',
      role: 'orchestrator'
    })
    const runs = runtime.listRuns()
    const detail = runtime.getRun({ runId: result.runId })

    expect(runs).toHaveLength(1)
    expect(runs[0]?.role).toBe('orchestrator')
    expect(runs[0]?.targetRole).toBe('workspace')
    expect(runs[0]?.assignedRoles).toEqual(['orchestrator', 'workspace'])
    expect(runs[0]?.latestAssistantResponse).toBe('Workspace answer ready')
    expect(result.status).toBe('completed')
    expect(result.targetRole).toBe('workspace')
    expect(result.assignedRoles).toEqual(['orchestrator', 'workspace'])
    expect(result.latestAssistantResponse).toBe('Workspace answer ready')
    expect(detail?.targetRole).toBe('workspace')
    expect(detail?.assignedRoles).toEqual(['orchestrator', 'workspace'])
    expect(detail?.latestAssistantResponse).toBe('Workspace answer ready')
    expect(detail?.messages.map((item) => item.sender)).toEqual(
      expect.arrayContaining(['system', 'user', 'tool', 'agent'])
    )

    db.close()
  })

  it('fails cleanly when no adapter can handle the task kind', async () => {
    const db = setupDatabase()
    const runtime = createAgentRuntime({
      db,
      adapters: []
    })

    const result = await runtime.runTask({
      prompt: 'Try an unknown task',
      role: 'workspace',
      taskKind: 'workspace.unknown' as AgentTaskKind
    } as RunAgentTaskInput)
    const detail = runtime.getRun({ runId: result.runId })

    expect(result.status).toBe('failed')
    expect(result.targetRole).toBe('workspace')
    expect(result.assignedRoles).toEqual(['workspace'])
    expect(result.latestAssistantResponse).toBeNull()
    expect(detail?.status).toBe('failed')
    expect(detail?.targetRole).toBe('workspace')
    expect(detail?.assignedRoles).toEqual(['workspace'])
    expect(detail?.latestAssistantResponse).toBeNull()
    expect(detail?.errorMessage).toMatch(/no agent adapter/i)
    expect(detail?.messages.at(-1)?.sender).toBe('system')

    db.close()
  })

  it('persists attempted delegation metadata when planning fails safety checks', async () => {
    const db = setupDatabase()
    const runtime = createAgentRuntime({
      db,
      adapters: []
    })

    const result = await runtime.runTask({
      prompt: 'Apply this safe group action now.',
      role: 'orchestrator',
      taskKind: 'review.apply_safe_group'
    } as unknown as RunAgentTaskInput)
    const detail = runtime.getRun({ runId: result.runId })

    expect(result.status).toBe('failed')
    expect(result.targetRole).toBe('review')
    expect(result.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(result.latestAssistantResponse).toBeNull()
    expect(detail?.status).toBe('failed')
    expect(detail?.targetRole).toBe('review')
    expect(detail?.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(detail?.latestAssistantResponse).toBeNull()
    expect(detail?.errorMessage).toMatch(/confirmation token required/i)

    db.close()
  })

  it('passes replay-metadata-synchronized run state into adapters', async () => {
    const db = setupDatabase()
    let adapterTargetRole: AgentRole | null = null
    let adapterRunAssignedRoles: AgentRole[] = []
    let adapterAssignedRoles: AgentRole[] = []
    const workspaceAdapter: AgentAdapter = {
      role: 'workspace',
      canHandle: (taskKind) => taskKind === 'workspace.ask_memory',
      execute: async (context) => {
        adapterTargetRole = context.run.targetRole
        adapterRunAssignedRoles = [...context.run.assignedRoles]
        adapterAssignedRoles = context.assignedRoles
        return {
          messages: [
            {
              sender: 'agent',
              content: 'Workspace answer ready'
            }
          ]
        }
      }
    }

    const runtime = createAgentRuntime({
      db,
      adapters: [workspaceAdapter]
    })

    const result = await runtime.runTask({
      prompt: 'Use the workspace to answer this archive question.',
      role: 'orchestrator'
    })

    expect(result.status).toBe('completed')
    expect(adapterTargetRole).toBe('workspace')
    expect(adapterRunAssignedRoles).toEqual(['orchestrator', 'workspace'])
    expect(adapterRunAssignedRoles).toEqual(adapterAssignedRoles)

    db.close()
  })

  it('previews execution routing without persisting a run row', () => {
    const db = setupDatabase()
    const runtime = createAgentRuntime({
      db,
      adapters: []
    })

    const preview = runtime.previewTask({
      prompt: 'Approve review item rq-1',
      role: 'orchestrator'
    })

    expect(preview).toEqual({
      taskKind: 'review.apply_item_decision',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      requiresConfirmation: true
    })
    expect(runtime.listRuns()).toEqual([])

    db.close()
  })

  it('lists, dismisses, and runs persisted suggestions through runtime methods', async () => {
    const db = setupDatabase()
    const governanceAdapter: AgentAdapter = {
      role: 'governance',
      canHandle: (taskKind) => taskKind === 'governance.summarize_failures',
      execute: async () => ({
        messages: [
          {
            sender: 'agent',
            content: 'Summarized failed runs and highlighted top regressions.'
          }
        ]
      })
    }
    const runtime = createAgentRuntime({
      db,
      adapters: [governanceAdapter]
    })

    const dismissedSeed = upsertAgentSuggestion(db, {
      triggerKind: 'review.safe_group_available',
      role: 'review',
      taskKind: 'review.suggest_safe_group_action',
      taskInput: {
        role: 'review',
        taskKind: 'review.suggest_safe_group_action',
        prompt: 'Summarize safe group candidates for review queue.'
      },
      dedupeKey: 'review.safe-group::runtime-dismiss',
      sourceRunId: null,
      observedAt: '2026-03-30T00:10:00.000Z'
    })
    const runnableSeed = upsertAgentSuggestion(db, {
      triggerKind: 'governance.failed_runs_detected',
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      taskInput: {
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        prompt: 'Summarize failed agent runs from the proactive monitor.'
      },
      dedupeKey: 'governance.failed-runs::runtime-run',
      sourceRunId: null,
      observedAt: '2026-03-30T00:11:00.000Z'
    })

    const suggestedRows = runtime.listSuggestions({
      status: 'suggested'
    })
    const dismissed = runtime.dismissSuggestion({
      suggestionId: dismissedSeed.suggestionId
    })
    const runResult = await runtime.runSuggestion({
      suggestionId: runnableSeed.suggestionId
    })
    const dismissedRows = runtime.listSuggestions({
      status: 'dismissed'
    })
    const executedRows = runtime.listSuggestions({
      status: 'executed'
    })

    expect(suggestedRows.map((item) => item.suggestionId)).toEqual([
      runnableSeed.suggestionId,
      dismissedSeed.suggestionId
    ])
    expect(dismissed?.status).toBe('dismissed')
    expect(runResult?.status).toBe('completed')
    expect(runResult?.runId).toBeTruthy()
    expect(dismissedRows.map((item) => item.suggestionId)).toEqual([dismissedSeed.suggestionId])
    expect(executedRows.map((item) => item.suggestionId)).toEqual([runnableSeed.suggestionId])
    expect(executedRows[0]?.executedRunId).toBe(runResult?.runId ?? null)

    db.close()
  })

  it('keeps a suggestion in suggested state when runSuggestion fails before execution completes', async () => {
    const db = setupDatabase()
    const runtime = createAgentRuntime({
      db,
      adapters: []
    })

    const guardedSuggestion = upsertAgentSuggestion(db, {
      triggerKind: 'review.safe_group_available',
      role: 'review',
      taskKind: 'review.apply_safe_group',
      taskInput: {
        role: 'review',
        taskKind: 'review.apply_safe_group',
        prompt: 'Apply safe group group-1 now.'
      },
      dedupeKey: 'review.safe-group::requires-confirmation',
      sourceRunId: null,
      observedAt: '2026-03-30T00:12:00.000Z'
    })

    const result = await runtime.runSuggestion({
      suggestionId: guardedSuggestion.suggestionId
    })
    const suggestedRows = runtime.listSuggestions({
      status: 'suggested'
    })
    const executedRows = runtime.listSuggestions({
      status: 'executed'
    })

    expect(result?.status).toBe('failed')
    expect(suggestedRows.map((item) => item.suggestionId)).toContain(guardedSuggestion.suggestionId)
    expect(executedRows).toEqual([])

    db.close()
  })

  it('infers review.apply_item_decision for approve/reject prompts with explicit review item ids', async () => {
    const db = setupDatabase()
    let delegatedTaskKind: AgentTaskKind | null = null
    const reviewAdapter: AgentAdapter = {
      role: 'review',
      canHandle: (taskKind) => taskKind === 'review.apply_item_decision',
      execute: async (context) => {
        delegatedTaskKind = context.taskKind
        return {
          messages: [
            {
              sender: 'agent',
              content: 'Applied review item decision for rq-1'
            }
          ]
        }
      }
    }

    const runtime = createAgentRuntime({
      db,
      adapters: [reviewAdapter]
    })

    const result = await runtime.runTask({
      prompt: 'Approve review item rq-1',
      role: 'orchestrator',
      confirmationToken: 'confirm-item-rq-1'
    })

    expect(result.status).toBe('completed')
    expect(result.targetRole).toBe('review')
    expect(result.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(delegatedTaskKind).toBe('review.apply_item_decision')

    db.close()
  })

  it('infers review.apply_item_decision for approve prompts with uuid review item ids', async () => {
    const db = setupDatabase()
    let delegatedTaskKind: AgentTaskKind | null = null
    const reviewAdapter: AgentAdapter = {
      role: 'review',
      canHandle: (taskKind) => taskKind === 'review.apply_item_decision',
      execute: async (context) => {
        delegatedTaskKind = context.taskKind
        return {
          messages: [
            {
              sender: 'agent',
              content: 'Applied review item decision for 123e4567-e89b-12d3-a456-426614174000'
            }
          ]
        }
      }
    }

    const runtime = createAgentRuntime({
      db,
      adapters: [reviewAdapter]
    })

    const result = await runtime.runTask({
      prompt: 'Approve review item 123e4567-e89b-12d3-a456-426614174000',
      role: 'orchestrator',
      confirmationToken: 'confirm-item-uuid-1'
    })

    expect(result.status).toBe('completed')
    expect(result.targetRole).toBe('review')
    expect(result.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(delegatedTaskKind).toBe('review.apply_item_decision')

    db.close()
  })
})
