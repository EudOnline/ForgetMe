import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  appendPersonAgentAuditEvent,
  enqueuePersonAgentRefresh,
  replacePersonAgentFactMemories,
  upsertPersonAgent,
  upsertPersonAgentInteractionMemory
} from '../../../src/main/services/governancePersistenceService'
import { materializePersonAgentCapsule } from '../../../src/main/services/personAgentCapsuleService'
import * as promptBundleService from '../../../src/main/services/personAgentCapsulePromptBundleService'
import { runPersonAgentRuntime } from '../../../src/main/services/personAgentRuntimeService'
import { syncPersonAgentTasks } from '../../../src/main/services/personAgentTaskService'

const NOW = '2026-04-09T02:00:00.000Z'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-runtime-'))
  const appPaths = ensureAppPaths(root)
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return {
    db,
    appPaths
  }
}

function seedCanonicalPerson(db: ReturnType<typeof openDatabase>, input: {
  canonicalPersonId: string
  displayName: string
  anchorPersonId: string
}) {
  db.prepare(
    `insert into people (id, display_name, source_type, confidence, created_at)
     values (?, ?, ?, ?, ?)`
  ).run(
    input.anchorPersonId,
    input.displayName,
    'chat',
    1,
    NOW
  )

  db.prepare(
    `insert into canonical_people (
      id, primary_display_name, normalized_name, alias_count, evidence_count, manual_labels_json, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.canonicalPersonId,
    input.displayName,
    input.displayName.toLowerCase(),
    1,
    4,
    '[]',
    'approved',
    NOW,
    NOW
  )

  db.prepare(
    `insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?)`
  ).run(
    `${input.canonicalPersonId}:${input.anchorPersonId}`,
    input.canonicalPersonId,
    input.anchorPersonId,
    'active',
    NOW,
    NOW
  )
}

function seedRuntimeFixture(db: ReturnType<typeof openDatabase>, appPaths: ReturnType<typeof ensureAppPaths>) {
  seedCanonicalPerson(db, {
    canonicalPersonId: 'cp-1',
    displayName: 'Alice Chen',
    anchorPersonId: 'p-1'
  })

  const personAgent = upsertPersonAgent(db, {
    canonicalPersonId: 'cp-1',
    status: 'active',
    promotionTier: 'high_signal',
    promotionScore: 88,
    promotionReasonSummary: 'High-signal person ready for unified runtime execution.',
    strategyProfile: {
      profileVersion: 2,
      responseStyle: 'contextual',
      evidencePreference: 'quote_first',
      conflictBehavior: 'conflict_forward'
    },
    factsVersion: 3,
    interactionVersion: 4
  })

  replacePersonAgentFactMemories(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: 'cp-1',
    rows: [
      {
        memoryKey: 'identity.birthday',
        sectionKey: 'identity',
        displayLabel: 'Birthday',
        summaryValue: '1997-02-03',
        memoryKind: 'fact',
        confidence: 1,
        conflictState: 'none',
        freshnessAt: NOW,
        sourceRefs: [],
        sourceHash: 'hash-birthday'
      },
      {
        memoryKey: 'conflict.school_name',
        sectionKey: 'conflict',
        displayLabel: 'school_name',
        summaryValue: 'Pending values: 北京大学 / 清华大学 (2 pending)',
        memoryKind: 'conflict',
        confidence: null,
        conflictState: 'open',
        freshnessAt: NOW,
        sourceRefs: [],
        sourceHash: 'hash-conflict'
      }
    ]
  })

  upsertPersonAgentInteractionMemory(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: 'cp-1',
    memoryKey: 'topic.profile_facts',
    topicLabel: 'Profile facts',
    summary: 'Birthday asked 3 times.',
    questionCount: 3,
    citationCount: 1,
    outcomeKinds: ['answered'],
    supportingTurnIds: ['turn-1'],
    lastQuestionAt: NOW,
    lastCitationAt: NOW
  })

  enqueuePersonAgentRefresh(db, {
    refreshId: 'refresh-1',
    canonicalPersonId: 'cp-1',
    personAgentId: personAgent.personAgentId,
    status: 'pending',
    reasons: ['review_conflict_changed'],
    requestedAt: '2026-04-09T02:01:00.000Z'
  })

  appendPersonAgentAuditEvent(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: 'cp-1',
    eventKind: 'strategy_profile_updated',
    payload: {
      source: 'refresh_rebuild',
      changedFields: ['conflictBehavior']
    },
    createdAt: '2026-04-09T02:01:30.000Z'
  })

  materializePersonAgentCapsule(db, {
    appPaths,
    personAgent,
    activationSource: 'import_batch',
    checkpointKind: 'activation',
    summary: 'Initial capsule for unified runtime tests.',
    now: NOW
  })

  return personAgent
}

describe('personAgentRuntimeService', () => {
  it('runs consultation and task execution through the same capsule runtime prompt path', () => {
    const { db, appPaths } = setupDatabase()
    seedRuntimeFixture(db, appPaths)

    const promptArtifactsSpy = vi.spyOn(
      promptBundleService,
      'buildPersonAgentCapsuleRuntimePromptArtifacts'
    )

    const [refreshTask, conflictTask] = syncPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      now: NOW
    })

    expect(refreshTask?.taskKind).toBe('await_refresh')
    expect(conflictTask?.taskKind).toBe('resolve_conflict')

    const taskResult = runPersonAgentRuntime(db, {
      operationKind: 'task_run',
      taskId: conflictTask!.taskId,
      source: 'workspace_ui',
      now: '2026-04-09T02:05:00.000Z'
    })

    expect(taskResult).toMatchObject({
      resultKind: 'task_run',
      taskRun: expect.objectContaining({
        taskId: conflictTask!.taskId,
        taskKind: 'resolve_conflict',
        promptBundle: expect.objectContaining({
          operationKind: 'task_run',
          promptInput: 'Review the conflicting evidence for school_name before answering with a single value.'
        })
      })
    })

    const consultationResult = runPersonAgentRuntime(db, {
      operationKind: 'consultation',
      canonicalPersonId: 'cp-1',
      question: '她的生日是什么？',
      now: '2026-04-09T02:06:00.000Z'
    })

    expect(consultationResult).toMatchObject({
      resultKind: 'consultation_turn',
      consultationTurn: expect.objectContaining({
        canonicalPersonId: 'cp-1',
        question: '她的生日是什么？',
        answerPack: expect.objectContaining({
          candidateAnswer: expect.stringContaining('1997-02-03'),
          capsulePromptBundle: expect.objectContaining({
            operationKind: 'consultation',
            promptInput: '她的生日是什么？'
          })
        })
      })
    })

    expect(
      promptArtifactsSpy.mock.calls.some(([, input]) => input.operationKind === 'task_run')
    ).toBe(true)
    expect(
      promptArtifactsSpy.mock.calls.some(([, input]) => input.operationKind === 'consultation')
    ).toBe(true)

    db.close()
  })
})
