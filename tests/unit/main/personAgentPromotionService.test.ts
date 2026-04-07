import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  buildPersonAgentPromotionScore,
  evaluatePersonAgentPromotion
} from '../../../src/main/services/personAgentPromotionService'

const NOW = '2026-04-06T12:00:00.000Z'
const DETERMINISTIC_FALLBACK_EVALUATED_AT = '1970-01-01T00:00:00.000Z'

function createTestDb() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-promotion-db-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function seedCanonicalPerson(db: ReturnType<typeof openDatabase>, input: {
  id: string
  displayName: string
}) {
  db.prepare(
    `insert into canonical_people (
      id, primary_display_name, normalized_name, alias_count, evidence_count, manual_labels_json, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.displayName,
    input.displayName.toLowerCase(),
    0,
    0,
    '[]',
    'approved',
    NOW,
    NOW
  )
}

function seedAnchorMembership(db: ReturnType<typeof openDatabase>, input: {
  canonicalPersonId: string
  anchorPersonId: string
}) {
  db.prepare(
    `insert into people (id, display_name, source_type, confidence, created_at)
     values (?, ?, ?, ?, ?)`
  ).run(
    input.anchorPersonId,
    input.anchorPersonId,
    'chat',
    1,
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

function seedProfileFact(db: ReturnType<typeof openDatabase>, input: {
  id: string
  canonicalPersonId: string
  attributeKey: string
  displayValue: string
  sourceFileId?: string | null
  sourceEvidenceId?: string | null
  sourceCandidateId?: string | null
}) {
  db.prepare(
    `insert into person_profile_attributes (
      id,
      canonical_person_id,
      attribute_group,
      attribute_key,
      value_json,
      display_value,
      source_file_id,
      source_evidence_id,
      source_candidate_id,
      provenance_json,
      confidence,
      status,
      approved_journal_id,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.canonicalPersonId,
    'identity',
    input.attributeKey,
    JSON.stringify({ value: input.displayValue }),
    input.displayValue,
    input.sourceFileId ?? null,
    input.sourceEvidenceId ?? null,
    input.sourceCandidateId ?? null,
    '{}',
    0.95,
    'active',
    null,
    NOW,
    NOW
  )
}

function seedMentionRelation(db: ReturnType<typeof openDatabase>, input: {
  sourceAnchorId: string
  fileId: string
}) {
  db.prepare(
    `insert into relations (
      id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `${input.sourceAnchorId}:${input.fileId}`,
    input.sourceAnchorId,
    'person',
    input.fileId,
    'file',
    'mentioned_in_file',
    1,
    NOW
  )
}

function seedPersonTurn(db: ReturnType<typeof openDatabase>, input: {
  sessionId: string
  turnId: string
  canonicalPersonId: string
  ordinal: number
  citationCount: number
  createdAt: string
}) {
  db.prepare(
    `insert into memory_workspace_sessions (
      id, scope_kind, scope_target_id, title, latest_question, turn_count, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.sessionId,
    'person',
    input.canonicalPersonId,
    `Memory Workspace · ${input.canonicalPersonId}`,
    'question',
    input.ordinal,
    input.createdAt,
    input.createdAt
  )

  const citations = Array.from({ length: input.citationCount }).map((_, index) => ({
    citationId: `citation-${input.turnId}-${index}`,
    kind: 'person',
    targetId: input.canonicalPersonId,
    label: input.canonicalPersonId
  }))

  db.prepare(
    `insert into memory_workspace_turns (
      id, session_id, ordinal, question, response_json, provider, model, prompt_hash, context_hash, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.turnId,
    input.sessionId,
    input.ordinal,
    'who is this person',
    JSON.stringify({
      answer: {
        citations
      },
      guardrail: {
        citationCount: citations.length
      }
    }),
    null,
    null,
    `prompt-${input.turnId}`,
    `context-${input.turnId}`,
    input.createdAt
  )
}

describe('personAgentPromotionService', () => {
  it('keeps low-signal people unpromoted', () => {
    const db = createTestDb()
    seedCanonicalPerson(db, { id: 'cp-low', displayName: 'Low Signal' })
    seedAnchorMembership(db, { canonicalPersonId: 'cp-low', anchorPersonId: 'anchor-low-1' })

    const result = evaluatePersonAgentPromotion(db, {
      canonicalPersonId: 'cp-low',
      now: NOW
    })

    expect(result.decision).toBe('unpromoted')
    expect(result.shouldActivate).toBe(false)
    expect(result.promotionTier).toBe('cold')
    expect(result.promotionScore.signals.approvedFactCount).toBe(0)
    expect(result.promotionScore.signals.evidenceSourceCount).toBe(0)

    db.close()
  })

  it('activates high-signal people with approved facts and interaction history', () => {
    const db = createTestDb()
    seedCanonicalPerson(db, { id: 'cp-high', displayName: 'High Signal' })
    seedCanonicalPerson(db, { id: 'cp-peer', displayName: 'Peer' })

    seedAnchorMembership(db, { canonicalPersonId: 'cp-high', anchorPersonId: 'anchor-high-1' })
    seedAnchorMembership(db, { canonicalPersonId: 'cp-peer', anchorPersonId: 'anchor-peer-1' })

    seedMentionRelation(db, { sourceAnchorId: 'anchor-high-1', fileId: 'file-shared-1' })
    seedMentionRelation(db, { sourceAnchorId: 'anchor-peer-1', fileId: 'file-shared-1' })

    seedProfileFact(db, { id: 'fact-1', canonicalPersonId: 'cp-high', attributeKey: 'birthday', displayValue: '1997-02-03' })
    seedProfileFact(db, { id: 'fact-2', canonicalPersonId: 'cp-high', attributeKey: 'school', displayValue: 'School A' })
    seedProfileFact(db, { id: 'fact-3', canonicalPersonId: 'cp-high', attributeKey: 'city', displayValue: 'Shanghai' })
    seedProfileFact(db, { id: 'fact-4', canonicalPersonId: 'cp-high', attributeKey: 'habit', displayValue: 'Journaling' })

    seedPersonTurn(db, {
      sessionId: 'session-high-1',
      turnId: 'turn-high-1',
      canonicalPersonId: 'cp-high',
      ordinal: 1,
      citationCount: 2,
      createdAt: '2026-04-05T09:00:00.000Z'
    })
    seedPersonTurn(db, {
      sessionId: 'session-high-2',
      turnId: 'turn-high-2',
      canonicalPersonId: 'cp-high',
      ordinal: 1,
      citationCount: 2,
      createdAt: '2026-04-05T10:00:00.000Z'
    })
    seedPersonTurn(db, {
      sessionId: 'session-high-3',
      turnId: 'turn-high-3',
      canonicalPersonId: 'cp-high',
      ordinal: 1,
      citationCount: 2,
      createdAt: '2026-04-05T11:00:00.000Z'
    })
    seedPersonTurn(db, {
      sessionId: 'session-high-4',
      turnId: 'turn-high-4',
      canonicalPersonId: 'cp-high',
      ordinal: 1,
      citationCount: 2,
      createdAt: '2026-04-05T12:00:00.000Z'
    })

    const result = evaluatePersonAgentPromotion(db, {
      canonicalPersonId: 'cp-high',
      now: NOW
    })

    expect(result.decision).toBe('active')
    expect(result.shouldActivate).toBe(true)
    expect(result.promotionTier === 'active' || result.promotionTier === 'high_signal').toBe(true)
    expect(result.promotionScore.signals.approvedFactCount).toBe(4)
    expect(result.promotionScore.signals.recentQuestionCount).toBe(4)
    expect(result.promotionScore.signals.recentCitationCount).toBe(8)

    db.close()
  })

  it('is deterministic for the same archive state', () => {
    const db = createTestDb()
    seedCanonicalPerson(db, { id: 'cp-deterministic', displayName: 'Deterministic' })
    seedAnchorMembership(db, { canonicalPersonId: 'cp-deterministic', anchorPersonId: 'anchor-deterministic-1' })
    seedProfileFact(db, {
      id: 'fact-deterministic-1',
      canonicalPersonId: 'cp-deterministic',
      attributeKey: 'city',
      displayValue: 'Hangzhou'
    })

    const first = evaluatePersonAgentPromotion(db, {
      canonicalPersonId: 'cp-deterministic'
    })
    const second = evaluatePersonAgentPromotion(db, {
      canonicalPersonId: 'cp-deterministic'
    })

    expect(second).toEqual(first)
    expect(first.promotionScore.evaluatedAt).toBe(NOW)

    db.close()
  })

  it('uses deterministic evaluatedAt fallback in score builder', () => {
    const score = buildPersonAgentPromotionScore({
      canonicalPersonId: 'cp-score-only',
      signals: {
        approvedFactCount: 0,
        evidenceSourceCount: 0,
        relationshipDegree: 0,
        recentQuestionCount: 0,
        recentCitationCount: 0
      }
    })

    expect(score.evaluatedAt).toBe(DETERMINISTIC_FALLBACK_EVALUATED_AT)
  })

  it('does not activate people with no approved evidence even with high interaction volume', () => {
    const db = createTestDb()
    seedCanonicalPerson(db, { id: 'cp-no-evidence', displayName: 'No Evidence' })

    seedPersonTurn(db, {
      sessionId: 'session-no-evidence-1',
      turnId: 'turn-no-evidence-1',
      canonicalPersonId: 'cp-no-evidence',
      ordinal: 1,
      citationCount: 6,
      createdAt: '2026-04-05T08:00:00.000Z'
    })
    seedPersonTurn(db, {
      sessionId: 'session-no-evidence-2',
      turnId: 'turn-no-evidence-2',
      canonicalPersonId: 'cp-no-evidence',
      ordinal: 1,
      citationCount: 6,
      createdAt: '2026-04-05T09:00:00.000Z'
    })
    seedPersonTurn(db, {
      sessionId: 'session-no-evidence-3',
      turnId: 'turn-no-evidence-3',
      canonicalPersonId: 'cp-no-evidence',
      ordinal: 1,
      citationCount: 6,
      createdAt: '2026-04-05T10:00:00.000Z'
    })
    seedPersonTurn(db, {
      sessionId: 'session-no-evidence-4',
      turnId: 'turn-no-evidence-4',
      canonicalPersonId: 'cp-no-evidence',
      ordinal: 1,
      citationCount: 6,
      createdAt: '2026-04-05T11:00:00.000Z'
    })

    const result = evaluatePersonAgentPromotion(db, {
      canonicalPersonId: 'cp-no-evidence',
      now: NOW
    })

    expect(result.decision).toBe('unpromoted')
    expect(result.shouldActivate).toBe(false)
    expect(result.reasonSummary).toContain('No approved evidence')
    expect(result.promotionScore.signals.recentQuestionCount).toBe(4)
    expect(result.promotionScore.signals.recentCitationCount).toBe(24)

    db.close()
  })

  it('counts evidence sources from approved facts instead of memberships', () => {
    const db = createTestDb()
    seedCanonicalPerson(db, { id: 'cp-evidence', displayName: 'Evidence Counter' })
    seedAnchorMembership(db, { canonicalPersonId: 'cp-evidence', anchorPersonId: 'anchor-evidence-1' })

    seedProfileFact(db, {
      id: 'fact-evidence-1',
      canonicalPersonId: 'cp-evidence',
      attributeKey: 'city',
      displayValue: 'Shanghai',
      sourceCandidateId: 'candidate-source-1'
    })
    seedProfileFact(db, {
      id: 'fact-evidence-2',
      canonicalPersonId: 'cp-evidence',
      attributeKey: 'birthday',
      displayValue: '1995-06-01',
      sourceCandidateId: 'candidate-source-1'
    })
    seedProfileFact(db, {
      id: 'fact-evidence-3',
      canonicalPersonId: 'cp-evidence',
      attributeKey: 'school',
      displayValue: 'School B',
      sourceCandidateId: 'candidate-source-2'
    })

    const result = evaluatePersonAgentPromotion(db, {
      canonicalPersonId: 'cp-evidence',
      now: NOW
    })

    expect(result.promotionScore.signals.evidenceSourceCount).toBe(2)

    db.close()
  })
})
