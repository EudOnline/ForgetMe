import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase } from '../../../src/main/services/db'
import { createImportBatch } from '../../../src/main/services/importBatchService'

describe('createImportBatch', () => {
  it('copies originals into the vault and creates a batch manifest', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-import-'))
    const appPaths = ensureAppPaths(root)
    const sourceFile = path.resolve('tests/fixtures/imports/sample-chat.txt')

    const batch = await createImportBatch({
      appPaths,
      sourcePaths: [sourceFile],
      sourceLabel: 'manual-test'
    })

    expect(batch.files).toHaveLength(1)
    expect(fs.existsSync(batch.files[0].frozenAbsolutePath)).toBe(true)
    expect(fs.readFileSync(batch.manifestPath, 'utf8')).toContain('manual-test')
  })

  it('persists chat communication evidence rows with speaker anchor matches', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-import-chat-evidence-'))
    const appPaths = ensureAppPaths(root)
    const sourceFile = path.resolve('tests/fixtures/imports/sample-chat.json')

    const batch = await createImportBatch({
      appPaths,
      sourcePaths: [sourceFile],
      sourceLabel: 'chat-evidence-test'
    })

    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    const rows = db.prepare(`
      select
        ce.ordinal as ordinal,
        ce.speaker_display_name as speakerDisplayName,
        ce.speaker_anchor_person_id as speakerAnchorPersonId,
        ce.excerpt_text as excerptText
      from communication_evidence ce
      where ce.file_id = ?
      order by ce.ordinal asc
    `).all(batch.files[0].fileId) as Array<{
      ordinal: number
      speakerDisplayName: string | null
      speakerAnchorPersonId: string | null
      excerptText: string
    }>

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      ordinal: 1,
      speakerDisplayName: 'Alice',
      excerptText: 'Hello Bob'
    })
    expect(rows[1]).toMatchObject({
      ordinal: 2,
      speakerDisplayName: 'Bob',
      excerptText: 'Hi Alice'
    })
    expect(rows.every((row) => typeof row.speakerAnchorPersonId === 'string' && row.speakerAnchorPersonId.length > 0)).toBe(true)

    db.close()
  })

  it('keeps partial success and duplicate classification when dirty data is mixed into one batch', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-import-dirty-data-'))
    const appPaths = ensureAppPaths(root)
    const unsupportedFile = path.join(root, 'fixture-unsupported.exe')
    fs.writeFileSync(unsupportedFile, 'binary-ish fixture')

    const batch = await createImportBatch({
      appPaths,
      sourcePaths: [
        path.resolve('tests/fixtures/imports/duplicate-chat-a.json'),
        path.resolve('tests/fixtures/imports/duplicate-chat-b.json'),
        path.resolve('tests/fixtures/imports/noisy-chat.txt'),
        unsupportedFile
      ],
      sourceLabel: 'dirty-data-test'
    })

    expect(batch.files).toHaveLength(4)
    expect(batch.summary).toMatchObject({
      frozenCount: 4,
      parsedCount: 3,
      duplicateCount: 1,
      reviewCount: 1
    })
    expect(batch.files.filter((file) => file.duplicateClass === 'duplicate_exact')).toHaveLength(1)
    expect(batch.files.filter((file) => file.parserStatus === 'parsed')).toHaveLength(3)
    expect(batch.files.filter((file) => file.parserStatus === 'failed').map((file) => file.fileName)).toEqual(['fixture-unsupported.exe'])
    expect(batch.files.map((file) => file.fileName)).toEqual([
      'duplicate-chat-a.json',
      'duplicate-chat-b.json',
      'noisy-chat.txt',
      'fixture-unsupported.exe'
    ])
  })
})
