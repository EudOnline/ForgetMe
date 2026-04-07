import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MemoryWorkspaceResponse } from '../../../src/shared/archiveContracts'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  listPersonAgentInteractionMemories,
  upsertPersonAgent
} from '../../../src/main/services/governancePersistenceService'
import { recordPersonAgentInteractionMemory } from '../../../src/main/services/personAgentInteractionMemoryService'

const NOW = '2026-04-06T12:00:00.000Z'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-interaction-memory-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function seedCanonicalPerson(db: ReturnType<typeof openDatabase>, input: {
  canonicalPersonId: string
  displayName: string
}) {
  db.prepare(
    `insert into canonical_people (
      id, primary_display_name, normalized_name, alias_count, evidence_count, manual_labels_json, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.canonicalPersonId,
    input.displayName,
    input.displayName.toLowerCase(),
    1,
    3,
    '[]',
    'approved',
    NOW,
    NOW
  )
}

function createResponseFixture(input: {
  canonicalPersonId?: string
  question?: string
  summary?: string
  citations?: MemoryWorkspaceResponse['answer']['citations']
  decision?: MemoryWorkspaceResponse['guardrail']['decision']
  reasonCodes?: MemoryWorkspaceResponse['guardrail']['reasonCodes']
  boundaryRedirect?: MemoryWorkspaceResponse['boundaryRedirect']
} = {}): MemoryWorkspaceResponse {
  const citations = input.citations ?? []
  const question = input.question ?? '她现在有哪些还没解决的冲突？'

  return {
    scope: {
      kind: 'person',
      canonicalPersonId: input.canonicalPersonId ?? 'cp-1'
    },
    question,
    expressionMode: 'grounded',
    workflowKind: 'default',
    title: 'Memory Workspace · Alice Chen',
    answer: {
      summary: input.summary ?? 'Open conflicts remain on school_name.',
      displayType: input.decision === 'fallback_insufficient_evidence' ? 'coverage_gap' : 'open_conflict',
      citations
    },
    contextCards: [],
    guardrail: {
      decision: input.decision ?? 'fallback_to_conflict',
      reasonCodes: input.reasonCodes ?? ['open_conflict_present'],
      citationCount: citations.length,
      sourceKinds: citations.map((citation) => citation.kind),
      fallbackApplied: (input.decision ?? 'fallback_to_conflict') !== 'grounded_answer'
    },
    boundaryRedirect: input.boundaryRedirect ?? null,
    communicationEvidence: null,
    personaDraft: null
  }
}

describe('personAgentInteractionMemoryService', () => {
  it('merges repeated asks into one aggregated topic instead of duplicating raw text', () => {
    const db = setupDatabase()
    seedCanonicalPerson(db, {
      canonicalPersonId: 'cp-1',
      displayName: 'Alice Chen'
    })
    const personAgent = upsertPersonAgent(db, {
      canonicalPersonId: 'cp-1',
      status: 'active',
      promotionTier: 'active',
      promotionScore: 52,
      promotionReasonSummary: 'High signal person.',
      factsVersion: 1,
      interactionVersion: 0
    })

    recordPersonAgentInteractionMemory(db, {
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      turnId: 'turn-1',
      question: '她现在有哪些还没解决的冲突？',
      response: createResponseFixture({
        citations: [
          { citationId: 'c-1', kind: 'review', targetId: 'rq-1', label: 'Open school_name conflicts' },
          { citationId: 'c-2', kind: 'file', targetId: 'f-2', label: 'transcript-1.pdf' }
        ]
      }),
      createdAt: '2026-04-06T12:01:00.000Z'
    })

    recordPersonAgentInteractionMemory(db, {
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      turnId: 'turn-2',
      question: '那为什么这个冲突最值得先处理？',
      response: createResponseFixture({
        question: '那为什么这个冲突最值得先处理？',
        summary: 'Resolving the school_name conflict is the safest next step.',
        citations: [
          { citationId: 'c-3', kind: 'review', targetId: 'rq-1', label: 'Open school_name conflicts' }
        ]
      }),
      createdAt: '2026-04-06T12:02:00.000Z'
    })

    const records = listPersonAgentInteractionMemories(db, {
      personAgentId: personAgent.personAgentId
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      memoryKey: 'topic.conflict_resolution',
      topicLabel: 'Conflict resolution',
      questionCount: 2,
      citationCount: 3,
      outcomeKinds: ['conflict_redirect'],
      supportingTurnIds: ['turn-1', 'turn-2'],
      lastQuestionAt: '2026-04-06T12:02:00.000Z',
      lastCitationAt: '2026-04-06T12:02:00.000Z'
    })
    expect(records[0]?.summary).toContain('Conflict resolution')
    expect(records[0]?.summary).toContain('transcript-1.pdf')
    expect(records[0]?.summary).not.toContain('那为什么这个冲突最值得先处理？')

    db.close()
  })

  it('stores coverage-gap and redirect outcomes with cited context labels', () => {
    const db = setupDatabase()
    seedCanonicalPerson(db, {
      canonicalPersonId: 'cp-1',
      displayName: 'Alice Chen'
    })
    const personAgent = upsertPersonAgent(db, {
      canonicalPersonId: 'cp-1',
      status: 'active',
      promotionTier: 'active',
      promotionScore: 52,
      promotionReasonSummary: 'High signal person.',
      factsVersion: 1,
      interactionVersion: 0
    })

    recordPersonAgentInteractionMemory(db, {
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      turnId: 'turn-gap',
      question: '她过去是怎么说跑步训练这类事的？给我看原话。',
      response: createResponseFixture({
        question: '她过去是怎么说跑步训练这类事的？给我看原话。',
        summary: 'Current evidence is insufficient.',
        decision: 'fallback_insufficient_evidence',
        reasonCodes: ['coverage_gap_present'],
        citations: []
      }),
      createdAt: '2026-04-06T12:03:00.000Z'
    })

    recordPersonAgentInteractionMemory(db, {
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      turnId: 'turn-redirect',
      question: '如果她本人会怎么建议我？请模仿她的口吻回答。',
      response: createResponseFixture({
        question: '如果她本人会怎么建议我？请模仿她的口吻回答。',
        summary: 'This memory workspace cannot answer as if it were the archived person.',
        decision: 'fallback_unsupported_request',
        reasonCodes: ['persona_request'],
        citations: [
          { citationId: 'c-4', kind: 'file', targetId: 'f-1', label: 'chat-1.json' }
        ],
        boundaryRedirect: {
          kind: 'persona_request',
          title: 'Persona request blocked',
          message: 'Cannot answer as the person.',
          reasons: ['persona_request'],
          suggestedActions: []
        }
      }),
      createdAt: '2026-04-06T12:04:00.000Z'
    })

    const records = listPersonAgentInteractionMemories(db, {
      personAgentId: personAgent.personAgentId
    })

    expect(records).toHaveLength(2)
    expect(records.find((record) => record.memoryKey === 'topic.past_expressions')).toMatchObject({
      outcomeKinds: ['coverage_gap'],
      questionCount: 1,
      citationCount: 0
    })
    expect(records.find((record) => record.memoryKey === 'topic.advice_request')).toMatchObject({
      outcomeKinds: ['review_redirect'],
      questionCount: 1,
      citationCount: 1
    })
    expect(records.find((record) => record.memoryKey === 'topic.advice_request')?.summary).toContain('chat-1.json')

    db.close()
  })
})
