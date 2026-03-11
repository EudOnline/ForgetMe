import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { buildEnrichedSearchRow } from '../../../src/main/services/enrichedSearchService'
import { searchArchive } from '../../../src/main/services/searchService'
import { getCanonicalPerson, getPersonTimeline } from '../../../src/main/services/timelineService'

function setupDatabase(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const appPaths = ensureAppPaths(root)
  const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
  runMigrations(db)
  return { root, appPaths, db }
}

describe('buildEnrichedSearchRow', () => {
  it('includes approved enriched text and approved field values in search haystacks', () => {
    const row = buildEnrichedSearchRow({
      fileName: 'id-card.jpg',
      enrichedTexts: ['张三'],
      approvedFields: ['北京大学']
    })

    expect(row.haystack).toContain('张三')
    expect(row.haystack).toContain('北京大学')
  })
})

describe('approved enrichment consumption', () => {
  it('lets archive search match approved enriched text and approved field values', async () => {
    const { appPaths, db } = setupDatabase('forgetme-enriched-search-')
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'search', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/id-card.jpg', '/tmp/id-card.jpg', 'id-card.jpg', '.jpg', 'image/jpeg', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare(`insert into enriched_evidence (
      id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('ee-1', 'f-1', 'job-1', 'image_summary', '{"imageSummary":"毕业合影"}', 'low', 'approved', createdAt, createdAt)
    db.prepare(`insert into enriched_evidence (
      id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('ee-2', 'f-1', 'job-1', 'approved_structured_field', '{"fieldType":"education","fieldKey":"school_name","fieldValue":{"value":"北京大学"},"documentType":"transcript"}', 'high', 'approved', createdAt, createdAt)
    db.close()

    const enrichedResults = await searchArchive({ appPaths, query: '毕业合影' })
    const approvedFieldResults = await searchArchive({ appPaths, query: '北京大学' })

    expect(enrichedResults.map((item) => item.fileId)).toContain('f-1')
    expect(approvedFieldResults.map((item) => item.fileId)).toContain('f-1')
  })

  it('returns approved structured fields on canonical person detail', () => {
    const { db } = setupDatabase('forgetme-person-enriched-')
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'people', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/transcript.pdf', '/tmp/transcript.pdf', 'transcript.pdf', '.pdf', 'application/pdf', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare('insert into people (id, display_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?)').run('p-1', 'Alice Chen', 'parser', 0.9, createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into person_aliases (id, canonical_person_id, anchor_person_id, display_name, normalized_name, source_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('pa-1', 'cp-1', 'p-1', 'Alice Chen', 'alice chen', 'parser', 0.9, createdAt)
    db.prepare('insert into person_memberships (id, canonical_person_id, anchor_person_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('pm-1', 'cp-1', 'p-1', 'active', createdAt, createdAt)
    db.prepare('insert into relations (id, source_id, source_type, target_id, target_type, relation_type, confidence, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run('r-1', 'p-1', 'person', 'f-1', 'file', 'mentioned_in_file', 0.9, createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare(`insert into enriched_evidence (
      id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('ee-1', 'f-1', 'job-1', 'approved_structured_field', '{"fieldType":"education","fieldKey":"school_name","fieldValue":{"value":"北京大学"},"documentType":"transcript"}', 'high', 'approved', createdAt, createdAt)

    const person = getCanonicalPerson(db, { canonicalPersonId: 'cp-1' })

    expect(person?.approvedFields).toEqual([
      expect.objectContaining({
        fileId: 'f-1',
        fieldKey: 'school_name',
        value: '北京大学'
      })
    ])
    db.close()
  })

  it('adds approved enrichment signals to timeline evidence', () => {
    const { db } = setupDatabase('forgetme-timeline-enriched-')
    const createdAt = '2026-03-11T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'timeline', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/chat.png', '/tmp/chat.png', 'chat.png', '.png', 'image/png', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare('insert into canonical_people (id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at, evidence_count, manual_labels_json, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cp-1', 'Alice Chen', 'alice chen', 1, createdAt, createdAt, 1, '[]', 'approved', createdAt, createdAt)
    db.prepare('insert into event_clusters (id, title, time_start, time_end, summary, status, source_candidate_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('ec-1', 'Chat recap', '2026-03-11T08:00:00.000Z', '2026-03-11T08:05:00.000Z', 'timeline summary', 'approved', null, createdAt, createdAt)
    db.prepare('insert into event_cluster_members (id, event_cluster_id, canonical_person_id, created_at) values (?, ?, ?, ?)').run('ecm-1', 'ec-1', 'cp-1', createdAt)
    db.prepare('insert into event_cluster_evidence (id, event_cluster_id, file_id, created_at) values (?, ?, ?, ?)').run('ece-1', 'ec-1', 'f-1', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'chat_screenshot', 'siliconflow', 'model', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare(`insert into enriched_evidence (
      id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('ee-1', 'f-1', 'job-1', 'image_summary', '{"imageSummary":"聊天截图提到毕业旅行"}', 'low', 'approved', createdAt, createdAt)
    db.prepare(`insert into enriched_evidence (
      id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('ee-2', 'f-1', 'job-1', 'image_detected_locations', '{"detectedLocations":["杭州"]}', 'low', 'approved', createdAt, createdAt)

    const timeline = getPersonTimeline(db, { canonicalPersonId: 'cp-1' })

    expect(timeline[0].evidence[0].enrichmentSignals).toEqual(expect.arrayContaining(['聊天截图提到毕业旅行', '杭州']))
    db.close()
  })
})
