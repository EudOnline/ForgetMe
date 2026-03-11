import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { chooseEnhancerType } from '../../../src/main/services/enrichmentDispatchService'
import { createImportBatch } from '../../../src/main/services/importBatchService'

describe('chooseEnhancerType', () => {
  it('routes image files to image understanding and PDF files to document OCR', () => {
    expect(chooseEnhancerType({ extension: '.jpg', fileName: 'photo.jpg' })).toBe('image_understanding')
    expect(chooseEnhancerType({ extension: '.pdf', fileName: 'score.pdf' })).toBe('document_ocr')
    expect(chooseEnhancerType({ extension: '.png', fileName: 'chat-screenshot.png' })).toBe('chat_screenshot')
    expect(chooseEnhancerType({ extension: '.txt', fileName: 'notes.txt' })).toBe(null)
  })
})

describe('createImportBatch phase-three dispatch', () => {
  it('creates enrichment jobs for supported imported files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase3-import-'))
    const appPaths = ensureAppPaths(root)

    await createImportBatch({
      appPaths,
      sourcePaths: [
        path.resolve('tests/fixtures/imports/sample-image.jpg'),
        path.resolve('tests/fixtures/imports/sample-doc.pdf')
      ],
      sourceLabel: 'phase-three-dispatch'
    })

    const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
    runMigrations(db)

    const jobs = db.prepare(
      `select enhancer_type as enhancerType, provider, model, status
       from enrichment_jobs
       order by enhancer_type asc`
    ).all() as Array<{
      enhancerType: string
      provider: string
      model: string
      status: string
    }>

    expect(jobs).toEqual([
      expect.objectContaining({ enhancerType: 'document_ocr', provider: 'siliconflow', status: 'pending' }),
      expect.objectContaining({ enhancerType: 'image_understanding', provider: 'siliconflow', status: 'pending' })
    ])
    expect(jobs.every((job) => job.model.length > 0)).toBe(true)

    db.close()
  })
})
