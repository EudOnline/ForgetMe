import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  appendAgentMessage,
  createAgentPolicyVersion,
  createAgentRun,
  getAgentRun,
  listAgentRuns,
  listAgentMemories,
  listAgentPolicyVersions,
  updateAgentRunReplayMetadata,
  upsertAgentMemory
} from '../../../src/main/services/agentPersistenceService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-runtime-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('agent persistence service', () => {
  it('creates a run, appends ordered messages, and fetches the detail view', () => {
    const db = setupDatabase()

    const run = createAgentRun(db, {
      role: 'ingestion',
      taskKind: 'ingestion.import_batch',
      prompt: 'Import the latest chat export'
    })

    appendAgentMessage(db, {
      runId: run.runId,
      sender: 'user',
      content: 'Start the import'
    })
    appendAgentMessage(db, {
      runId: run.runId,
      sender: 'agent',
      content: 'Import queued'
    })

    const detail = getAgentRun(db, { runId: run.runId })

    expect(run.runId).toBeTruthy()
    expect(detail?.messages.map((item) => item.ordinal)).toEqual([1, 2])
    expect(detail?.prompt).toBe('Import the latest chat export')

    db.close()
  })

  it('upserts memory by role and memory key', () => {
    const db = setupDatabase()

    upsertAgentMemory(db, {
      role: 'review',
      memoryKey: 'review.safe_batch.rules',
      memoryValue: 'initial rules'
    })
    upsertAgentMemory(db, {
      role: 'review',
      memoryKey: 'review.safe_batch.rules',
      memoryValue: 'updated rules'
    })

    const memories = listAgentMemories(db, {
      role: 'review'
    })

    expect(memories).toHaveLength(1)
    expect(memories[0]?.memoryKey).toBe('review.safe_batch.rules')
    expect(memories[0]?.memoryValue).toBe('updated rules')

    db.close()
  })

  it('lists and fetches persisted run replay metadata', () => {
    const db = setupDatabase()

    const run = createAgentRun(db, {
      role: 'orchestrator',
      taskKind: 'orchestrator.plan_next_action',
      prompt: 'Summarize review queue pressure'
    })

    updateAgentRunReplayMetadata(db, {
      runId: run.runId,
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      latestAssistantResponse: '1 pending items across 1 conflict groups.'
    })

    const listedRuns = listAgentRuns(db)
    const detail = getAgentRun(db, { runId: run.runId })

    expect(listedRuns[0]?.targetRole).toBe('review')
    expect(listedRuns[0]?.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(listedRuns[0]?.latestAssistantResponse).toBe('1 pending items across 1 conflict groups.')
    expect(detail?.targetRole).toBe('review')
    expect(detail?.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(detail?.latestAssistantResponse).toBe('1 pending items across 1 conflict groups.')

    db.close()
  })

  it('preserves latest assistant response when replay metadata update omits it', () => {
    const db = setupDatabase()

    const run = createAgentRun(db, {
      role: 'orchestrator',
      taskKind: 'orchestrator.plan_next_action',
      targetRole: 'workspace',
      assignedRoles: ['orchestrator', 'workspace'],
      latestAssistantResponse: 'Initial workspace answer',
      prompt: 'Answer with workspace context'
    })

    const updated = updateAgentRunReplayMetadata(db, {
      runId: run.runId,
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review']
    })
    const detail = getAgentRun(db, { runId: run.runId })

    expect(updated?.targetRole).toBe('review')
    expect(updated?.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(updated?.latestAssistantResponse).toBe('Initial workspace answer')
    expect(detail?.latestAssistantResponse).toBe('Initial workspace answer')

    db.close()
  })

  it('reads default replay metadata for rows inserted without replay columns', () => {
    const db = setupDatabase()
    const runId = 'legacy-run-without-replay-columns'
    const now = new Date().toISOString()

    db.prepare(
      `insert into agent_runs (
        id,
        role,
        task_kind,
        status,
        prompt,
        confirmation_token,
        policy_version,
        error_message,
        created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      runId,
      'workspace',
      'workspace.ask_memory',
      'queued',
      'Legacy row with no replay metadata',
      null,
      null,
      null,
      now,
      now
    )

    const listed = listAgentRuns(db)
    const detail = getAgentRun(db, { runId })

    expect(listed[0]?.runId).toBe(runId)
    expect(listed[0]?.assignedRoles).toEqual([])
    expect(listed[0]?.latestAssistantResponse).toBeNull()
    expect(detail?.assignedRoles).toEqual([])
    expect(detail?.latestAssistantResponse).toBeNull()

    db.close()
  })

  it('appends policy versions instead of mutating prior ones', () => {
    const db = setupDatabase()

    createAgentPolicyVersion(db, {
      role: 'governance',
      policyKey: 'governance.review.policy',
      policyBody: 'version 1',
      createdAt: '2026-03-29T00:00:00.000Z'
    })
    createAgentPolicyVersion(db, {
      role: 'governance',
      policyKey: 'governance.review.policy',
      policyBody: 'version 2',
      createdAt: '2026-03-29T00:00:01.000Z'
    })

    const rows = db.prepare(
      `select policy_body as policyBody
       from agent_policy_versions
       where role = ?
       order by created_at asc`
    ).all('governance') as Array<{ policyBody: string }>

    expect(rows.map((row) => row.policyBody)).toEqual(['version 1', 'version 2'])

    db.close()
  })

  it('lists policy versions newest-first with optional role and policy-key filters', () => {
    const db = setupDatabase()

    createAgentPolicyVersion(db, {
      policyVersionId: 'policy-1',
      role: 'governance',
      policyKey: 'governance.review.policy',
      policyBody: 'version 1',
      createdAt: '2026-03-29T00:00:00.000Z'
    })
    createAgentPolicyVersion(db, {
      policyVersionId: 'policy-2',
      role: 'governance',
      policyKey: 'governance.review.policy',
      policyBody: 'version 2',
      createdAt: '2026-03-29T00:00:02.000Z'
    })
    createAgentPolicyVersion(db, {
      policyVersionId: 'policy-3',
      role: 'review',
      policyKey: 'review.safe_batch.policy',
      policyBody: 'review policy',
      createdAt: '2026-03-29T00:00:01.000Z'
    })

    const allPolicies = listAgentPolicyVersions(db)
    const governancePolicies = listAgentPolicyVersions(db, {
      role: 'governance'
    })
    const keyedPolicies = listAgentPolicyVersions(db, {
      policyKey: 'governance.review.policy'
    })

    expect(allPolicies.map((item) => item.policyVersionId)).toEqual([
      'policy-2',
      'policy-3',
      'policy-1'
    ])
    expect(governancePolicies.map((item) => item.policyVersionId)).toEqual([
      'policy-2',
      'policy-1'
    ])
    expect(keyedPolicies.map((item) => item.policyBody)).toEqual([
      'version 2',
      'version 1'
    ])

    db.close()
  })
})
