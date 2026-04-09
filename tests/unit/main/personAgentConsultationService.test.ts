import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  getPersonAgentRuntimeState,
  listPersonAgentTaskRuns,
  listPersonAgentTasks,
  replacePersonAgentFactMemories,
  upsertPersonAgent,
  upsertPersonAgentInteractionMemory
} from '../../../src/main/services/governancePersistenceService'
import {
  askPersonAgentConsultationPersisted,
  getPersonAgentConsultationSession,
  listPersonAgentConsultationSessions
} from '../../../src/main/services/personAgentConsultationService'
import { materializePersonAgentCapsule } from '../../../src/main/services/personAgentCapsuleService'

const NOW = '2026-04-08T12:00:00.000Z'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-consultation-'))
  const appPaths = ensureAppPaths(root)
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return {
    root,
    appPaths,
    db
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

function seedConsultationFixture(
  db: ReturnType<typeof openDatabase>,
  input: {
    appPaths?: ReturnType<typeof ensureAppPaths>
    status?: 'active' | 'candidate'
  } = {}
) {
  seedCanonicalPerson(db, {
    canonicalPersonId: 'cp-1',
    displayName: 'Alice Chen',
    anchorPersonId: 'p-1'
  })

  const personAgent = upsertPersonAgent(db, {
    canonicalPersonId: 'cp-1',
    status: input.status ?? 'active',
    promotionTier: 'high_signal',
    promotionScore: 74,
    promotionReasonSummary: 'High signal person.',
    strategyProfile: {
      profileVersion: 1,
      responseStyle: 'contextual',
      evidencePreference: 'quote_first',
      conflictBehavior: 'balanced'
    },
    factsVersion: 2,
    interactionVersion: 3
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
    summary: 'Birthday asked 2 times.',
    questionCount: 2,
    citationCount: 1,
    outcomeKinds: ['answered'],
    supportingTurnIds: ['turn-1'],
    lastQuestionAt: NOW,
    lastCitationAt: NOW
  })

  materializePersonAgentCapsule(db, {
    appPaths: input.appPaths,
    personAgent,
    activationSource: 'import_batch',
    checkpointKind: 'activation',
    summary: 'Initial capsule for consultation runtime tests.',
    now: NOW
  })

  return personAgent
}

describe('personAgentConsultationService', () => {
  it('creates persisted consultation sessions, appends turns, and updates runtime state', () => {
    const { appPaths, db } = setupDatabase()
    const personAgent = seedConsultationFixture(db, { appPaths })

    const firstTurn = askPersonAgentConsultationPersisted(db, {
      canonicalPersonId: 'cp-1',
      question: '她的生日是什么？',
      now: NOW
    })

    expect(firstTurn).toMatchObject({
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      ordinal: 1,
      question: '她的生日是什么？',
      answerPack: expect.objectContaining({
        questionClassification: 'profile_fact',
        candidateAnswer: expect.stringContaining('1997-02-03')
      })
    })

    const listedSessions = listPersonAgentConsultationSessions(db, {
      canonicalPersonId: 'cp-1'
    })
    expect(listedSessions).toEqual([
      expect.objectContaining({
        personAgentId: personAgent.personAgentId,
        canonicalPersonId: 'cp-1',
        turnCount: 1,
        latestQuestion: '她的生日是什么？'
      })
    ])

    const secondTurn = askPersonAgentConsultationPersisted(db, {
      canonicalPersonId: 'cp-1',
      question: '她还有什么冲突？',
      sessionId: firstTurn!.sessionId,
      now: '2026-04-08T12:05:00.000Z'
    })

    expect(secondTurn).toMatchObject({
      sessionId: firstTurn?.sessionId,
      ordinal: 2,
      answerPack: expect.objectContaining({
        questionClassification: 'general'
      })
    })

    const detail = getPersonAgentConsultationSession(db, {
      sessionId: firstTurn!.sessionId
    })
    expect(detail?.turns.map((turn) => turn.ordinal)).toEqual([1, 2])

    const runtimeState = getPersonAgentRuntimeState(db, {
      canonicalPersonId: 'cp-1'
    })
    expect(runtimeState).toMatchObject({
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      activeSessionId: firstTurn?.sessionId,
      sessionCount: 1,
      totalTurnCount: 2,
      latestQuestion: '她还有什么冲突？',
      latestQuestionClassification: 'general',
      lastConsultedAt: '2026-04-08T12:05:00.000Z',
      capsuleId: expect.any(String),
      capsuleSessionNamespace: `person-agent:${personAgent.personAgentId}`
    })
    expect(runtimeState?.lastAnswerDigest?.length).toBeGreaterThan(0)
    const runtimeStateArtifact = JSON.parse(
      fs.readFileSync(
        path.join(appPaths.personAgentStateDir, personAgent.personAgentId, 'runtime-state.json'),
        'utf8'
      )
    ) as Record<string, unknown>
    expect(runtimeStateArtifact).toEqual(expect.objectContaining({
      canonicalPersonId: 'cp-1',
      personAgentId: personAgent.personAgentId,
      activeSessionId: firstTurn?.sessionId,
      totalTurnCount: 2,
      latestQuestion: '她还有什么冲突？',
      lastConsultedAt: '2026-04-08T12:05:00.000Z'
    }))
    expect(listPersonAgentTaskRuns(db, {
      canonicalPersonId: 'cp-1'
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskKind: 'expand_topic',
        capsuleId: expect.any(String),
        capsuleSessionNamespace: `person-agent:${personAgent.personAgentId}`
      }),
      expect.objectContaining({
        taskKind: 'resolve_conflict',
        capsuleId: expect.any(String),
        capsuleSessionNamespace: `person-agent:${personAgent.personAgentId}`
      })
    ]))
    expect(listPersonAgentTaskRuns(db, {
      canonicalPersonId: 'cp-1'
    }).map((run) => run.taskKind).sort()).toEqual([
      'expand_topic',
      'resolve_conflict'
    ])
    expect(listPersonAgentTasks(db, {
      canonicalPersonId: 'cp-1',
      status: 'completed'
    }).map((task) => task.taskKind)).toEqual([
      'resolve_conflict',
      'expand_topic'
    ])

    db.close()
  })

  it('returns null when the person agent is missing or inactive', () => {
    const { db } = setupDatabase()
    seedConsultationFixture(db, { status: 'candidate' })

    expect(askPersonAgentConsultationPersisted(db, {
      canonicalPersonId: 'cp-1',
      question: '她的生日是什么？',
      now: NOW
    })).toBeNull()

    expect(askPersonAgentConsultationPersisted(db, {
      canonicalPersonId: 'cp-missing',
      question: '她的生日是什么？',
      now: NOW
    })).toBeNull()

    db.close()
  })
})
