import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { getPersonGraph, setRelationshipLabel } from '../../../src/main/services/graphService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-graph-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('getPersonGraph', () => {
  it('returns approved evidence edges and manual labels only', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-10T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'graph-test', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/a.json', '/tmp/a.json', 'a.json', '.json', null, 1, 'h1', 'unique', 'parsed', createdAt)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-1', 'Alice Chen', 'chat_participant', 0.8, createdAt)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-2', 'Bob', 'chat_participant', 0.8, createdAt)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-3', 'Carol', 'chat_participant', 0.8, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-2', 'Bob', 'bob', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-3', 'Carol', 'carol', 1, createdAt, createdAt, 1, '[]', 'pending', createdAt, createdAt)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-1', 'cp-1', 'p-1', 'active', createdAt, createdAt)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-2', 'cp-2', 'p-2', 'active', createdAt, createdAt)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-3', 'cp-3', 'p-3', 'active', createdAt, createdAt)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('r-1', 'p-1', 'person', 'f-1', 'file', 'mentioned_in_file', 0.8, createdAt)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('r-2', 'p-2', 'person', 'f-1', 'file', 'mentioned_in_file', 0.8, createdAt)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('r-3', 'p-3', 'person', 'f-1', 'file', 'mentioned_in_file', 0.8, createdAt)

    setRelationshipLabel(db, { fromPersonId: 'cp-1', toPersonId: 'cp-2', label: 'friend' })

    const graph = getPersonGraph(db, { canonicalPersonId: 'cp-1' })

    expect(graph.nodes.map((node) => node.id)).toEqual(['cp-1', 'cp-2'])
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0]).toEqual(expect.objectContaining({
      fromPersonId: 'cp-1',
      toPersonId: 'cp-2',
      status: 'approved',
      sharedFileCount: 1,
      manualLabel: 'friend'
    }))
    expect(graph.edges.every((edge) => edge.status === 'approved')).toBe(true)
    db.close()
  })
})
