import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentRole, AgentTaskKind, RunAgentTaskInput } from '../../../src/shared/archiveContracts'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createAgentRuntime } from '../../../src/main/services/agentRuntimeService'
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
