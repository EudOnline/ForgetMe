import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createImportBatch } from '../../../src/main/services/importBatchService'
import { buildImportPreflight } from '../../../src/main/services/importPreflightService'

describe('buildImportPreflight', () => {
  it('classifies supported, unsupported, and duplicate candidates before import', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-import-preflight-'))
    const appPaths = ensureAppPaths(root)

    const existingSource = path.resolve('tests/fixtures/imports/sample-chat.txt')
    await createImportBatch({
      appPaths,
      sourcePaths: [existingSource],
      sourceLabel: 'already-imported'
    })

    const unsupportedFile = path.join(root, 'file.exe')
    fs.writeFileSync(unsupportedFile, 'unsupported fixture')

    const result = await buildImportPreflight({
      appPaths,
      sourcePaths: [existingSource, unsupportedFile]
    })

    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      fileName: 'sample-chat.txt',
      extension: '.txt',
      importKindHint: 'chat',
      status: 'duplicate_candidate',
      isSupported: true
    })
    expect(result.items[1].status).toBe('unsupported')
    expect(result.summary).toMatchObject({
      totalCount: 2,
      supportedCount: 1,
      unsupportedCount: 1
    })
  })

  it('marks repeated supported files in the same preflight batch as duplicate candidates', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-import-preflight-seen-in-batch-'))
    const appPaths = ensureAppPaths(root)
    const repeatedSource = '/tmp/repeated-chat.txt'

    const result = await buildImportPreflight({
      appPaths,
      sourcePaths: [repeatedSource, repeatedSource]
    })

    expect(result.items).toHaveLength(2)
    expect(result.items[0]?.status).toBe('supported')
    expect(result.items[1]?.status).toBe('duplicate_candidate')
  })

  it('matches duplicate candidates case-insensitively with normalized DB rows', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-import-preflight-case-insensitive-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    db.prepare(
      'insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)'
    ).run('batch-1', 'seed', 'ready', '2026-03-29T00:00:00.000Z')
    db.prepare(
      `insert into vault_files (
        id, batch_id, source_path, frozen_path, file_name, extension, mime_type,
        file_size, sha256, duplicate_class, parser_status, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'file-1',
      'batch-1',
      '/seed/path',
      '/seed/frozen/path',
      '  SAMPLE-CHAT.TXT  ',
      '  .TXT  ',
      null,
      1,
      'seed-hash',
      'unique',
      'parsed',
      '2026-03-29T00:00:00.000Z'
    )
    db.close()

    const result = await buildImportPreflight({
      appPaths,
      sourcePaths: ['/tmp/sample-chat.txt']
    })

    expect(result.items[0]?.status).toBe('duplicate_candidate')
    expect(result.items[0]?.isSupported).toBe(true)
  })

  it('returns image/document/unknown kind hints', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-import-preflight-kind-hints-'))
    const appPaths = ensureAppPaths(root)

    const result = await buildImportPreflight({
      appPaths,
      sourcePaths: ['/tmp/photo.PNG', '/tmp/notes.pdf', '/tmp/binary.exe']
    })

    expect(result.items.map((item) => item.importKindHint)).toEqual(['image', 'document', 'unknown'])
    expect(result.items.map((item) => item.status)).toEqual(['supported', 'supported', 'unsupported'])
  })
})
