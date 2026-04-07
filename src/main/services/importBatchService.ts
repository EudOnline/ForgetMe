import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { AppPaths } from './appPaths'
import { ensureCanonicalPeopleForAnchors } from './canonicalPeopleService'
import { generatePersonMergeCandidates } from './candidateService'
import { classifyExactDuplicate, countExistingHashes } from './dedupService'
import {
  seedE2EDossierConflictFixture,
  seedE2EGroupPortraitFixture,
  seedE2EMultimodalReviewFixture,
  seedE2EPersonAgentFixture,
  seedE2ERunnerProfileFixture,
  seedE2ESafeBatchFixture
} from './e2eMultimodalFixtureService'
import { enqueueEnrichmentJobs } from './enrichmentDispatchService'
import { openDatabase, runMigrations } from './db'
import { parseFrozenFile } from './parserRegistry'
import { collectPeopleAnchors, persistPeopleAnchors } from './peopleService'
import { enqueuePersonAgentRefreshesForBatch } from './personAgentRefreshService'
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

    db.prepare('update vault_files set parser_status = ? where id = ?').run(parserStatus, frozen.fileId)

    files.push({
      ...frozen,
      duplicateClass,
      parserStatus
    })
  }

  const anchors = persistPeopleAnchors(db, collectPeopleAnchors({ parsedFiles }))
  const anchorLookup = new Map(
    anchors.map((anchor) => [`${anchor.sourceFileId}:${anchor.displayName}`, anchor.personId])
  )

  for (const parsedFile of parsedFiles) {
    const communicationExcerpts = parsedFile.summary.communicationExcerpts
    if (!Array.isArray(communicationExcerpts) || communicationExcerpts.length === 0) {
      continue
    }

    for (const excerpt of communicationExcerpts) {
      db.prepare(
        `insert into communication_evidence (
          id, file_id, ordinal, speaker_display_name, speaker_anchor_person_id, excerpt_text, created_at
        ) values (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        parsedFile.fileId,
        excerpt.ordinal,
        excerpt.speakerDisplayName,
        excerpt.speakerDisplayName ? anchorLookup.get(`${parsedFile.fileId}:${excerpt.speakerDisplayName}`) ?? null : null,
        excerpt.text,
        createdAt
      )
    }
  }

  ensureCanonicalPeopleForAnchors(db, anchors.map((anchor) => ({
    anchorPersonId: anchor.personId,
    displayName: anchor.displayName,
    sourceType: anchor.sourceType,
    confidence: anchor.confidence
  })))
  generatePersonMergeCandidates(db)
  enqueueEnrichmentJobs(db, files.map((file) => ({
    fileId: file.fileId,
    fileName: file.fileName,
    extension: file.extension
  })))
  persistFileBatchRelations(db, batchId, files.map((file) => file.fileId))
  persistPeopleFileRelations(db, anchors)
  enqueuePersonAgentRefreshesForBatch(db, {
    batchId,
    reason: 'import_batch',
    requestedAt: createdAt
  })

  if (process.env.FORGETME_E2E_MULTIMODAL_FIXTURE === '1' && files.length > 0 && anchors.length > 0) {
    seedE2EMultimodalReviewFixture(db, { fileId: files[0].fileId })
  }

  if (process.env.FORGETME_E2E_RUNNER_PROFILE_FIXTURE === '1' && files.length > 0 && anchors.length > 0) {
    seedE2ERunnerProfileFixture(db, { fileId: files[0].fileId })
  }

  if (process.env.FORGETME_E2E_DOSSIER_CONFLICT_FIXTURE === '1' && files.length > 0 && anchors.length > 0) {
    seedE2EDossierConflictFixture(db, { fileId: files[0].fileId })
  }

  if (process.env.FORGETME_E2E_GROUP_PORTRAIT_FIXTURE === '1' && files.length > 0 && anchors.length > 0) {
    seedE2EGroupPortraitFixture(db, { fileId: files[0].fileId })
  }

  if (process.env.FORGETME_E2E_PERSON_AGENT_FIXTURE === '1' && files.length > 0 && anchors.length > 0) {
    seedE2EPersonAgentFixture(db, { fileId: files[0].fileId })
  }

  if (process.env.FORGETME_E2E_SAFE_BATCH_FIXTURE === '1' && files.length > 0 && anchors.length > 0) {
    seedE2ESafeBatchFixture(db, { fileId: files[0].fileId })
  }

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
