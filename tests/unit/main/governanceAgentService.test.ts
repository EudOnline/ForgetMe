import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AgentMemoryRecord, AgentPolicyVersionRecord, AgentRunRecord } from '../../../src/shared/archiveContracts'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createGovernanceAgentService } from '../../../src/main/services/agents/governanceAgentService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-governance-agent-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function createRunRecord(): AgentRunRecord {
  return {
    runId: 'run-1',
    role: 'governance',
    taskKind: 'governance.propose_policy_update',
    status: 'running',
    prompt: 'Summarize failures',
    confirmationToken: null,
    policyVersion: null,
    errorMessage: null,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z'
  }
}

describe('governance agent service', () => {
  it('records structured feedback into operational memory', async () => {
    const db = setupDatabase()
    const recordMemory = vi.fn().mockReturnValue({
      memoryId: 'memory-1',
      role: 'governance',
      memoryKey: 'governance.feedback',
      memoryValue: 'Need tighter safe-group rules.',
      createdAt: '2026-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:00:00.000Z'
    } satisfies AgentMemoryRecord)
    const agent = createGovernanceAgentService({
      recordMemory
    })

    const result = await agent.execute({
      db,
      run: createRunRecord(),
      input: {
        prompt: 'Record feedback: Need tighter safe-group rules.',
        role: 'governance',
        taskKind: 'governance.record_feedback'
      },
      taskKind: 'governance.record_feedback',
      assignedRoles: ['governance']
    })

    expect(recordMemory).toHaveBeenCalledWith({
      role: 'governance',
      memoryKey: 'governance.feedback',
      memoryValue: 'Need tighter safe-group rules.'
    })
    expect(result.messages?.at(-1)?.content).toContain('memory-1')

    db.close()
  })

  it('summarizes repeated failures from prior runs', async () => {
    const db = setupDatabase()
    const listRuns = vi.fn().mockReturnValue([
      {
        runId: 'run-1',
        role: 'review',
        taskKind: 'review.apply_safe_group',
        status: 'failed',
        prompt: 'Apply safe group',
        confirmationToken: null,
        policyVersion: null,
        errorMessage: 'confirmation token required',
        createdAt: '2026-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:00.000Z'
      },
      {
        runId: 'run-2',
        role: 'review',
        taskKind: 'review.apply_safe_group',
        status: 'failed',
        prompt: 'Apply safe group again',
        confirmationToken: null,
        policyVersion: null,
        errorMessage: 'confirmation token required',
        createdAt: '2026-03-29T00:01:00.000Z',
        updatedAt: '2026-03-29T00:01:00.000Z'
      }
    ])
    const agent = createGovernanceAgentService({
      listRuns
    })

    const result = await agent.execute({
      db,
      run: createRunRecord(),
      input: {
        prompt: 'Summarize recent failures',
        role: 'governance',
        taskKind: 'governance.summarize_failures'
      },
      taskKind: 'governance.summarize_failures',
      assignedRoles: ['governance']
    })

    expect(listRuns).toHaveBeenCalledWith({ status: 'failed' })
    expect(result.messages?.at(-1)?.content).toContain('2 failed runs')

    db.close()
  })

  it('creates policy proposals without activating them directly', async () => {
    const db = setupDatabase()
    const proposePolicyVersion = vi.fn().mockReturnValue({
      policyVersionId: 'policy-1',
      role: 'governance',
      policyKey: 'governance.review.policy',
      policyBody: 'Tighten safe-group approvals.',
      createdAt: '2026-03-29T00:00:00.000Z'
    } satisfies AgentPolicyVersionRecord)
    const agent = createGovernanceAgentService({
      proposePolicyVersion
    })

    const result = await agent.execute({
      db,
      run: createRunRecord(),
      input: {
        prompt: 'Propose policy update: Tighten safe-group approvals.',
        role: 'governance',
        taskKind: 'governance.propose_policy_update'
      },
      taskKind: 'governance.propose_policy_update',
      assignedRoles: ['governance']
    })

    expect(proposePolicyVersion).toHaveBeenCalledWith({
      role: 'governance',
      policyKey: 'governance.review.policy',
      policyBody: 'Tighten safe-group approvals.'
    })
    expect(result.messages?.at(-1)?.content).toContain('policy-1')

    db.close()
  })
})
