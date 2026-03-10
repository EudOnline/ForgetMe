import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { getPersonTimeline } from '../../../src/main/services/timelineService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-timeline-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('getPersonTimeline', () => {
  it('returns approved event clusters with nested evidence points only', () => {
    const db = setupDatabase()
    const createdAt = '2026-03-10T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'timeline-test', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/a.json', '/tmp/a.json', 'a.json', '.json', null, 1, 'h1', 'unique', 'parsed', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-2', 'b-1', '/tmp/b.json', '/tmp/b.json', 'b.json', '.json', null, 1, 'h2', 'unique', 'parsed', createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into event_clusters (id, title, time_start, time_end, summary, status, source_candidate_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('ec-1', 'Approved event', '2026-03-10T10:00:00.000Z', '2026-03-10T10:10:00.000Z', 'approved summary', 'approved', null, createdAt, createdAt)
    db.prepare('insert into event_clusters (id, title, time_start, time_end, summary, status, source_candidate_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('ec-2', 'Pending event', '2026-03-11T10:00:00.000Z', '2026-03-11T10:10:00.000Z', 'pending summary', 'pending', null, createdAt, createdAt)
    db.prepare('insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)').run('ecm-1', 'ec-1', 'cp-1', createdAt)
    db.prepare('insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)').run('ecm-2', 'ec-2', 'cp-1', createdAt)
    db.prepare('insert into event_cluster_evidence (id, event_cluster_id, file_id, created_at) values (?, ?, ?, ?)').run('ece-1', 'ec-1', 'f-1', createdAt)
    db.prepare('insert into event_cluster_evidence (id, event_cluster_id, file_id, created_at) values (?, ?, ?, ?)').run('ece-2', 'ec-2', 'f-2', createdAt)

    const timeline = getPersonTimeline(db, { canonicalPersonId: 'cp-1' })

    expect(timeline).toHaveLength(1)
    expect(timeline[0].eventId).toBe('ec-1')
    expect(timeline[0].evidence).toEqual([
      expect.objectContaining({
        fileId: 'f-1',
        fileName: 'a.json'
      })
    ])
    db.close()
  })
})
