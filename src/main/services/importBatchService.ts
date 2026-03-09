import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { AppPaths } from './appPaths'
import { classifyExactDuplicate, countExistingHashes } from './dedupService'
import { openDatabase, runMigrations } from './db'
import { parseFrozenFile } from './parserRegistry'
import { collectPeopleAnchors, persistPeopleAnchors } from './peopleService'
import { persistFileBatchRelations, persistPeopleFileRelations } from './relationService'
import { freezeOriginal } from './vaultService'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

function reportPath(appPaths: AppPaths, batchId: string) {
  return path.join(appPaths.importReportsDir, `${batchId}.json`)
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
  ).run(batchId, input.sourceLabel, 'processing', createdAt)

  const files = [] as Array<{
    fileId: string
    sourcePath: string
    fileName: string
    extension: string
    fileSize: number
    sha256: string
    duplicateClass: 'unique' | 'duplicate_exact'
    frozenAbsolutePath: string
    parserStatus: 'parsed' | 'failed'
  }>
  const parsedFiles = [] as Array<{ fileId: string; kind: string; summary: Record<string, unknown> }>
  let parsedCount = 0
  let reviewCount = 0

  for (const sourcePath of input.sourcePaths) {
    const frozen = await freezeOriginal(input.appPaths, batchId, sourcePath)
    const duplicateClass = classifyExactDuplicate(countExistingHashes(db, frozen.sha256))

    let parserStatus: 'parsed' | 'failed' = 'failed'
    try {
      const parsed = await parseFrozenFile(frozen.frozenAbsolutePath)
      parsedFiles.push({ fileId: frozen.fileId, kind: parsed.kind, summary: parsed.summary })
      db.prepare(
        'insert into file_derivatives (id, file_id, derivative_type, payload_json, created_at) values (?, ?, ?, ?, ?)'
      ).run(
        crypto.randomUUID(),
        frozen.fileId,
        'parsed_summary',
        JSON.stringify(parsed),
        createdAt
      )
      parserStatus = 'parsed'
      parsedCount += 1
    } catch {
      reviewCount += 1
    }

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
      parserStatus,
      createdAt
    )

    files.push({
      ...frozen,
      duplicateClass,
      parserStatus
    })
  }

  const anchors = persistPeopleAnchors(db, collectPeopleAnchors({ parsedFiles }))
  persistFileBatchRelations(db, batchId, files.map((file) => file.fileId))
  persistPeopleFileRelations(db, anchors)

  db.prepare('update import_batches set status = ? where id = ?').run('ready', batchId)

  const report = {
    batchId,
    sourceLabel: input.sourceLabel,
    createdAt,
    summary: {
      frozenCount: files.length,
      parsedCount,
      duplicateCount: files.filter((file) => file.duplicateClass === 'duplicate_exact').length,
      reviewCount
    },
    files
  }

  fs.writeFileSync(reportPath(input.appPaths, batchId), JSON.stringify(report, null, 2))

  db.close()

  return {
    batchId,
    manifestPath: reportPath(input.appPaths, batchId),
    files,
    summary: report.summary,
    sourceLabel: input.sourceLabel,
    createdAt
  }
}

export async function listImportBatches(appPaths: AppPaths) {
  return fs
    .readdirSync(appPaths.importReportsDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => JSON.parse(fs.readFileSync(path.join(appPaths.importReportsDir, fileName), 'utf8')))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function getImportBatch(appPaths: AppPaths, batchId: string) {
  const filename = reportPath(appPaths, batchId)
  if (!fs.existsSync(filename)) {
    return null
  }

  return JSON.parse(fs.readFileSync(filename, 'utf8'))
}
