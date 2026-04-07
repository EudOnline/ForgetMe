import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  enqueuePersonAgentRefresh,
  getPersonAgentByCanonicalPersonId,
  listPersonAgentFactMemories,
  listPersonAgentRefreshQueue,
  listPersonAgents,
  replacePersonAgentFactMemories,
  upsertPersonAgent
} from '../../../src/main/services/governancePersistenceService'

describe('person-agent persistence migrations', () => {
  it('creates person-agent tables with expected columns and indexes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    const tables = db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>
    const names = tables.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining([
      'person_agents',
      'person_agent_fact_memory',
      'person_agent_interaction_memory',
      'person_agent_refresh_queue',
      'person_agent_audit_events'
    ]))

    const personAgentColumns = db.prepare("pragma table_info('person_agents')").all() as Array<{ name: string }>
    expect(personAgentColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'canonical_person_id',
      'status',
      'promotion_tier',
      'promotion_score',
      'facts_version',
      'interaction_version'
    ]))

    const refreshQueueColumns = db.prepare("pragma table_info('person_agent_refresh_queue')").all() as Array<{ name: string }>
    expect(refreshQueueColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'canonical_person_id',
      'person_agent_id',
      'status',
      'reasons_json',
      'requested_at'
    ]))

    const personAgentIndexes = db.prepare(
      "select name from sqlite_master where type='index' and tbl_name='person_agents'"
    ).all() as Array<{ name: string }>
    expect(personAgentIndexes.map((row) => row.name)).toEqual(expect.arrayContaining([
      'uq_person_agents_canonical_person_id',
      'idx_person_agents_status'
    ]))

    const refreshQueueIndexes = db.prepare(
      "select name from sqlite_master where type='index' and tbl_name='person_agent_refresh_queue'"
    ).all() as Array<{ name: string }>
    expect(refreshQueueIndexes.map((row) => row.name)).toEqual(expect.arrayContaining([
      'idx_person_agent_refresh_queue_status',
      'idx_person_agent_refresh_queue_canonical_person_id'
    ]))

    const factMemoryIndexes = db.prepare(
      "select name from sqlite_master where type='index' and tbl_name='person_agent_fact_memory'"
    ).all() as Array<{ name: string }>
    expect(factMemoryIndexes.map((row) => row.name)).toEqual(expect.arrayContaining([
      'idx_person_agent_fact_memory_canonical_person_id',
      'idx_person_agent_fact_memory_person_agent_memory_key'
    ]))

    db.close()
  })

  it('upserts person agents, replaces fact memories, and enqueues refresh requests', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-db-'))
    const db = openDatabase(path.join(root, 'archive.sqlite'))

    runMigrations(db)

    db.prepare(
      `insert into canonical_people (
        id, primary_display_name, normalized_name, alias_count, evidence_count, manual_labels_json, status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'cp-1',
      'Alice Chen',
      'alice chen',
      0,
      3,
      '[]',
      'approved',
      '2026-04-06T09:00:00.000Z',
      '2026-04-06T09:00:00.000Z'
    )
    db.prepare(
      `insert into canonical_people (
        id, primary_display_name, normalized_name, alias_count, evidence_count, manual_labels_json, status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'cp-2',
      'Bob Li',
      'bob li',
      0,
      1,
      '[]',
      'approved',
      '2026-04-06T09:00:00.000Z',
      '2026-04-06T09:00:00.000Z'
    )

    const created = upsertPersonAgent(db, {
      canonicalPersonId: 'cp-1',
      status: 'active',
      promotionTier: 'active',
      promotionScore: 52,
      promotionReasonSummary: 'High signal person.',
      factsVersion: 1,
      interactionVersion: 2,
      lastActivatedAt: '2026-04-06T09:10:00.000Z'
    })

    const fetched = getPersonAgentByCanonicalPersonId(db, {
      canonicalPersonId: 'cp-1'
    })
    expect(fetched?.personAgentId).toBe(created.personAgentId)

    const updated = upsertPersonAgent(db, {
      canonicalPersonId: 'cp-1',
      status: 'active',
      promotionTier: 'high_signal',
      promotionScore: 74,
      promotionReasonSummary: 'Promotion score increased.',
      factsVersion: 2,
      interactionVersion: 3,
      lastActivatedAt: '2026-04-06T09:20:00.000Z'
    })

    expect(updated.personAgentId).toBe(created.personAgentId)
    expect(updated.promotionTier).toBe('high_signal')
    expect(updated.factsVersion).toBe(2)

    const listedAgents = listPersonAgents(db, {
      status: 'active'
    })
    expect(listedAgents.map((row) => row.personAgentId)).toContain(created.personAgentId)

    replacePersonAgentFactMemories(db, {
      personAgentId: created.personAgentId,
      canonicalPersonId: 'cp-1',
      rows: [
        {
          memoryKey: 'identity.birthday',
          sectionKey: 'identity',
          displayLabel: 'Birthday',
          summaryValue: '1997-02-03',
          memoryKind: 'fact',
          confidence: 0.9,
          conflictState: 'none',
          freshnessAt: '2026-04-06T09:15:00.000Z',
          sourceRefs: [{ kind: 'file', id: 'file-1', label: 'chat-1.json' }],
          sourceHash: 'hash-1'
        },
        {
          memoryKey: 'identity.document',
          sectionKey: 'identity',
          displayLabel: 'Source candidate',
          summaryValue: 'Candidate from OCR',
          memoryKind: 'coverage_gap',
          confidence: null,
          conflictState: 'open',
          freshnessAt: null,
          sourceRefs: [{ kind: 'candidate', id: 'candidate-1', label: 'candidate-1' }],
          sourceHash: 'hash-2'
        }
      ]
    })

    const firstPassRows = listPersonAgentFactMemories(db, {
      personAgentId: created.personAgentId
    })
    expect(firstPassRows).toHaveLength(2)

    expect(() => replacePersonAgentFactMemories(db, {
      personAgentId: created.personAgentId,
      canonicalPersonId: 'cp-2',
      rows: []
    })).toThrow(`Person-agent canonical mismatch: ${created.personAgentId} belongs to cp-1, got cp-2`)

    replacePersonAgentFactMemories(db, {
      personAgentId: created.personAgentId,
      canonicalPersonId: 'cp-1',
      rows: [
        {
          memoryKey: 'identity.birthday',
          sectionKey: 'identity',
          displayLabel: 'Birthday',
          summaryValue: '1997-02-03',
          memoryKind: 'fact',
          confidence: 0.95,
          conflictState: 'none',
          freshnessAt: '2026-04-06T09:18:00.000Z',
          sourceRefs: [{ kind: 'evidence', id: 'evidence-1', label: 'evidence-1' }],
          sourceHash: 'hash-3'
        }
      ]
    })

    const secondPassRows = listPersonAgentFactMemories(db, {
      personAgentId: created.personAgentId
    })
    expect(secondPassRows).toHaveLength(1)
    expect(secondPassRows[0]?.sourceRefs[0]?.kind).toBe('evidence')

    enqueuePersonAgentRefresh(db, {
      canonicalPersonId: 'cp-1',
      personAgentId: created.personAgentId,
      status: 'pending',
      reasons: ['import_batch', 'review_approved'],
      requestedAt: '2026-04-06T09:30:00.000Z'
    })

    const refreshQueue = listPersonAgentRefreshQueue(db, {
      status: 'pending'
    })
    expect(refreshQueue).toHaveLength(1)
    expect(refreshQueue[0]?.canonicalPersonId).toBe('cp-1')
    expect(refreshQueue[0]?.reasons).toEqual(['import_batch', 'review_approved'])

    db.close()
  })
})
