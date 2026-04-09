import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  getPersonAgentCapsule,
  replacePersonAgentFactMemories,
  upsertPersonAgentRuntimeState,
  upsertPersonAgent,
  upsertPersonAgentInteractionMemory
} from '../../../src/main/services/governancePersistenceService'
import { buildPersonAgentAnswerPack } from '../../../src/main/services/personAgentAnswerPackService'
import { materializePersonAgentCapsule } from '../../../src/main/services/personAgentCapsuleService'
import {
  appendPersonAgentCapsuleActivityEvent,
  syncPersonAgentCapsuleRuntimeArtifacts
} from '../../../src/main/services/personAgentCapsuleRuntimeArtifactsService'

const NOW = '2026-04-06T12:00:00.000Z'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-answer-pack-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function seedCanonicalPerson(db: ReturnType<typeof openDatabase>, input: {
  canonicalPersonId: string
  displayName: string
  anchorPersonId?: string
}) {
  const anchorPersonId = input.anchorPersonId ?? `anchor-${input.canonicalPersonId}`

  db.prepare(
    `insert into people (id, display_name, source_type, confidence, created_at)
     values (?, ?, ?, ?, ?)`
  ).run(
    anchorPersonId,
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
    `${input.canonicalPersonId}:${anchorPersonId}`,
    input.canonicalPersonId,
    anchorPersonId,
    'active',
    NOW,
    NOW
  )

  return { anchorPersonId }
}

function seedPersonAgentMemoryFixture(db: ReturnType<typeof openDatabase>) {
  const { anchorPersonId } = seedCanonicalPerson(db, {
    canonicalPersonId: 'cp-1',
    displayName: 'Alice Chen',
    anchorPersonId: 'p-1'
  })
  seedCanonicalPerson(db, {
    canonicalPersonId: 'cp-2',
    displayName: 'Bob Li',
    anchorPersonId: 'p-2'
  })

  db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'answer-pack', 'ready', NOW)
  for (const [fileId, fileName, text] of [
    ['f-1', 'chat-1.json', '我们还是把这些记录留在归档里，后面查起来更稳妥。'],
    ['f-2', 'chat-2.json', '重要细节继续记下来，后面回看归档会更清楚。']
  ] as const) {
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      fileId,
      'b-1',
      `/tmp/${fileName}`,
      `/tmp/${fileName}`,
      fileName,
      '.json',
      'application/json',
      1,
      `hash-${fileId}`,
      'unique',
      'parsed',
      NOW
    )
    db.prepare(
      `insert into communication_evidence (
        id, file_id, ordinal, speaker_display_name, speaker_anchor_person_id, excerpt_text, created_at
      ) values (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `ce-${fileId}`,
      fileId,
      1,
      'Alice Chen',
      anchorPersonId,
      text,
      NOW
    )
  }

  const personAgent = upsertPersonAgent(db, {
    canonicalPersonId: 'cp-1',
    status: 'active',
    promotionTier: 'high_signal',
    promotionScore: 74,
    promotionReasonSummary: 'High signal person.',
    strategyProfile: {
      profileVersion: 1,
      responseStyle: 'contextual',
      evidencePreference: 'quote_first',
      conflictBehavior: 'conflict_forward'
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
        sourceRefs: [{ kind: 'file', id: 'f-1', label: 'chat-1.json' }],
        sourceHash: 'hash-birthday'
      },
      {
        memoryKey: 'relationship.cp-2',
        sectionKey: 'relationship',
        displayLabel: 'Bob Li',
        summaryValue: 'friend; shared evidence files: 2',
        memoryKind: 'relationship',
        confidence: 1,
        conflictState: 'none',
        freshnessAt: NOW,
        sourceRefs: [{ kind: 'file', id: 'f-2', label: 'chat-2.json' }],
        sourceHash: 'hash-relationship'
      },
      {
        memoryKey: 'timeline.trip-plan',
        sectionKey: 'timeline',
        displayLabel: 'Trip planning',
        summaryValue: 'Trip planning (2026-03-13T08:00:00.000Z -> 2026-03-13T08:30:00.000Z); shared planning',
        memoryKind: 'timeline',
        confidence: 1,
        conflictState: 'none',
        freshnessAt: '2026-03-13T08:30:00.000Z',
        sourceRefs: [{ kind: 'file', id: 'f-2', label: 'chat-2.json' }],
        sourceHash: 'hash-timeline'
      },
      {
        memoryKey: 'conflict.school_name',
        sectionKey: 'conflict',
        displayLabel: 'School name conflict',
        summaryValue: 'Pending values: 北京大学 / 清华大学 (2 pending)',
        memoryKind: 'conflict',
        confidence: null,
        conflictState: 'open',
        freshnessAt: null,
        sourceRefs: [{ kind: 'review', id: 'rq-1', label: 'Open school_name conflicts' }],
        sourceHash: 'hash-conflict'
      },
      {
        memoryKey: 'coverage.work.empty',
        sectionKey: 'coverage',
        displayLabel: 'Work coverage gap',
        summaryValue: 'No approved work facts yet.',
        memoryKind: 'coverage_gap',
        confidence: null,
        conflictState: 'none',
        freshnessAt: null,
        sourceRefs: [],
        sourceHash: 'hash-gap'
      }
    ]
  })

  upsertPersonAgentInteractionMemory(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: 'cp-1',
    memoryKey: 'topic.past_expressions',
    topicLabel: 'Past expressions',
    summary: 'Past expressions. Asked 2 times. Outcomes: answered. Cited context: chat-1.json, chat-2.json.',
    questionCount: 2,
    citationCount: 2,
    outcomeKinds: ['answered'],
    supportingTurnIds: ['turn-1', 'turn-2'],
    lastQuestionAt: NOW,
    lastCitationAt: NOW
  })

  upsertPersonAgentInteractionMemory(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: 'cp-1',
    memoryKey: 'topic.conflict_resolution',
    topicLabel: 'Conflict resolution',
    summary: 'Conflict resolution. Asked 3 times. Outcomes: conflict_redirect. Cited context: Open school_name conflicts.',
    questionCount: 3,
    citationCount: 1,
    outcomeKinds: ['conflict_redirect'],
    supportingTurnIds: ['turn-3'],
    lastQuestionAt: NOW,
    lastCitationAt: NOW
  })

  return personAgent
}

describe('personAgentAnswerPackService', () => {
  it('prioritizes stable fact memory for factual profile questions', () => {
    const db = setupDatabase()
    const personAgent = seedPersonAgentMemoryFixture(db)

    const pack = buildPersonAgentAnswerPack(db, {
      canonicalPersonId: 'cp-1',
      question: '她的生日是什么？'
    })

    expect(pack).toMatchObject({
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      questionClassification: 'profile_fact',
      candidateAnswer: expect.stringContaining('1997-02-03'),
      generationReason: expect.stringContaining('fact memory'),
      strategyProfile: {
        profileVersion: 1,
        responseStyle: 'contextual',
        evidencePreference: 'quote_first',
        conflictBehavior: 'conflict_forward'
      },
      memoryVersions: {
        factsVersion: 2,
        interactionVersion: 3
      }
    })
    expect(pack?.supportingFacts[0]).toMatchObject({
      memoryKey: 'identity.birthday',
      value: '1997-02-03',
      memoryKind: 'fact'
    })
    expect(pack?.supportingCitations).toEqual([
      expect.objectContaining({
        kind: 'file',
        targetId: 'f-1',
        label: 'chat-1.json'
      })
    ])
    expect(pack?.recentInteractionTopics[0]?.topicLabel).toBe('Conflict resolution')

    db.close()
  })

  it('includes conflicts and coverage gaps when relationship questions still have ambiguity', () => {
    const db = setupDatabase()
    seedPersonAgentMemoryFixture(db)

    const pack = buildPersonAgentAnswerPack(db, {
      canonicalPersonId: 'cp-1',
      question: '她和 Bob Li 是什么关系？还有哪些资料缺口？'
    })

    expect(pack).toMatchObject({
      questionClassification: 'relationship'
    })
    expect(pack?.supportingFacts).toEqual([
      expect.objectContaining({
        memoryKey: 'relationship.cp-2',
        memoryKind: 'relationship'
      })
    ])
    expect(pack?.conflicts).toEqual([
      expect.objectContaining({
        fieldKey: 'school_name',
        summary: expect.stringContaining('北京大学')
      })
    ])
    expect(pack?.coverageGaps).toEqual([
      expect.objectContaining({
        gapKey: 'work.empty',
        summary: 'No approved work facts yet.'
      })
    ])
    expect(pack?.candidateAnswer).toContain('friend')

    db.close()
  })

  it('uses communication evidence for quote requests and falls back safely when excerpts are missing', () => {
    const db = setupDatabase()
    seedPersonAgentMemoryFixture(db)

    const quotePack = buildPersonAgentAnswerPack(db, {
      canonicalPersonId: 'cp-1',
      question: '她过去是怎么表达记录和归档这类事的？给我看原话。'
    })
    const missingQuotePack = buildPersonAgentAnswerPack(db, {
      canonicalPersonId: 'cp-1',
      question: '她过去是怎么说跑步训练这类事的？给我看原话。'
    })

    expect(quotePack).toMatchObject({
      questionClassification: 'quote_request',
      candidateAnswer: expect.stringContaining('Direct excerpts'),
      generationReason: expect.stringContaining('communication evidence')
    })
    expect(quotePack?.generationReason).toContain('quote-first')
    expect(quotePack?.supportingCitations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'file', targetId: 'f-1' }),
      expect.objectContaining({ kind: 'file', targetId: 'f-2' })
    ]))
    expect(quotePack?.recentInteractionTopics[0]?.topicLabel).toBe('Past expressions')

    expect(missingQuotePack).toMatchObject({
      questionClassification: 'quote_request',
      candidateAnswer: expect.stringContaining('insufficient')
    })
    expect(missingQuotePack?.coverageGaps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gapKey: 'communication.quote_evidence'
      })
    ]))

    db.close()
  })

  it('surfaces conflict-forward strategy hints in profile answers', () => {
    const db = setupDatabase()
    seedPersonAgentMemoryFixture(db)

    const pack = buildPersonAgentAnswerPack(db, {
      canonicalPersonId: 'cp-1',
      question: '她的生日是什么？'
    })

    expect(pack?.candidateAnswer).toContain('Open conflicts remain on school_name')

    db.close()
  })

  it('enriches answer packs with capsule runtime context when runtime artifacts exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-answer-pack-capsule-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(root, 'archive.sqlite'))
    runMigrations(db)
    const personAgent = seedPersonAgentMemoryFixture(db)

    materializePersonAgentCapsule(db, {
      appPaths,
      personAgent,
      activationSource: 'import_batch',
      checkpointKind: 'activation',
      summary: 'Initial activation checkpoint.',
      now: NOW
    })

    upsertPersonAgentRuntimeState(db, {
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      sessionCount: 1,
      totalTurnCount: 2,
      latestQuestion: '她的生日是什么？',
      latestQuestionClassification: 'profile_fact',
      lastAnswerDigest: 'Birthday: 1997-02-03.',
      lastConsultedAt: NOW,
      updatedAt: NOW
    })

    const capsule = getPersonAgentCapsule(db, {
      personAgentId: personAgent.personAgentId
    })
    expect(capsule).not.toBeNull()

    syncPersonAgentCapsuleRuntimeArtifacts(db, {
      capsule: capsule!,
      personAgent,
      now: NOW
    })
    appendPersonAgentCapsuleActivityEvent({
      capsule: capsule!,
      event: {
        eventKind: 'consultation_turn_persisted',
        capsuleId: capsule!.capsuleId,
        personAgentId: personAgent.personAgentId,
        canonicalPersonId: 'cp-1',
        sessionId: 'session-1',
        turnId: 'turn-1',
        question: '她的生日是什么？',
        createdAt: NOW
      }
    })

    const pack = buildPersonAgentAnswerPack(db, {
      canonicalPersonId: 'cp-1',
      question: '她的生日是什么？'
    })

    expect(pack?.capsuleRuntimeContext).toMatchObject({
      capsuleId: capsule!.capsuleId,
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      sessionNamespace: `person-agent:${personAgent.personAgentId}`,
      identitySummary: expect.stringContaining('Alice Chen'),
      memorySummary: expect.stringContaining('Facts v2'),
      runtimeSummary: expect.stringContaining('她的生日是什么？'),
      latestCheckpointSummary: expect.stringContaining('activation')
    })
    expect(pack?.capsuleRuntimeContext?.recentActivity).toEqual([
      expect.objectContaining({
        eventKind: 'consultation_turn_persisted',
        summary: expect.stringContaining('她的生日是什么？')
      }),
      expect.objectContaining({
        eventKind: 'capsule_checkpoint_written',
        summary: expect.stringContaining('activation')
      })
    ])

    db.close()
  })
})
