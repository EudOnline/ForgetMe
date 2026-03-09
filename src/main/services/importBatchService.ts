import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { AppPaths } from './appPaths'
import { classifyExactDuplicate, countExistingHashes } from './dedupService'
import { openDatabase, runMigrations } from './db'
import { freezeOriginal } from './vaultService'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

export async function createImportBatch(input: {
  appPaths: AppPaths
  sourcePaths: string[]
  sourceLabel: string
}) {
  const batchId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const db = openDatabase(databasePath(input.appPaths))

  runMigrations(db)
  db.prepare(
    'insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)'
  ).run(batchId, input.sourceLabel, 'frozen', createdAt)

  const files = []

  for (const sourcePath of input.sourcePaths) {
    const frozen = await freezeOriginal(input.appPaths, batchId, sourcePath)
    const duplicateClass = classifyExactDuplicate(countExistingHashes(db, frozen.sha256))

    db.prepare(
      `insert into vault_files (
        id, batch_id, source_path, frozen_path, file_name, extension, mime_type,
        file_size, sha256, duplicate_class, parser_status, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      frozen.fileId,
      batchId,
      frozen.sourcePath,
      frozen.frozenAbsolutePath,
      frozen.fileName,
      frozen.extension,
      null,
      frozen.fileSize,
      frozen.sha256,
      duplicateClass,
      'pending',
      createdAt
    )

    files.push({
      ...frozen,
      duplicateClass
    })
  }

  const manifestPath = path.join(input.appPaths.importReportsDir, `${batchId}.json`)

  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        batchId,
        sourceLabel: input.sourceLabel,
        createdAt,
        files
      },
      null,
      2
    )
  )

  db.close()

  return {
    batchId,
    manifestPath,
    files
  }
}
