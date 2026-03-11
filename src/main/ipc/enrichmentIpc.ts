import path from 'node:path'
import { ipcMain } from 'electron'
import { documentEvidenceInputSchema, enrichmentJobFilterSchema, jobIdSchema, journalIdSchema, queueItemIdSchema, rejectReviewItemInputSchema, structuredFieldCandidateFilterSchema } from '../../shared/ipcSchemas'
import type { AppPaths } from '../services/appPaths'
import { openDatabase, runMigrations } from '../services/db'
import { approveStructuredFieldCandidate, rejectStructuredFieldCandidate, undoStructuredFieldDecision } from '../services/enrichmentReviewService'
import { getDocumentEvidence, listEnrichmentJobs, listStructuredFieldCandidates, rerunEnrichmentJob } from '../services/enrichmentReadService'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

export function registerEnrichmentIpc(appPaths: AppPaths) {
  ipcMain.removeHandler('archive:listEnrichmentJobs')
  ipcMain.removeHandler('archive:getDocumentEvidence')
  ipcMain.removeHandler('archive:rerunEnrichmentJob')
  ipcMain.removeHandler('archive:listStructuredFieldCandidates')
  ipcMain.removeHandler('archive:approveStructuredFieldCandidate')
  ipcMain.removeHandler('archive:rejectStructuredFieldCandidate')
  ipcMain.removeHandler('archive:undoStructuredFieldDecision')

  ipcMain.handle('archive:listEnrichmentJobs', async (_event, payload) => {
    const input = enrichmentJobFilterSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const jobs = listEnrichmentJobs(db, input)
    db.close()
    return jobs
  })

  ipcMain.handle('archive:getDocumentEvidence', async (_event, payload) => {
    const input = documentEvidenceInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const evidence = getDocumentEvidence(db, input)
    db.close()
    return evidence
  })

  ipcMain.handle('archive:rerunEnrichmentJob', async (_event, payload) => {
    const { jobId } = jobIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const job = rerunEnrichmentJob(db, { jobId })
    db.close()
    return job
  })

  ipcMain.handle('archive:listStructuredFieldCandidates', async (_event, payload) => {
    const input = structuredFieldCandidateFilterSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const candidates = listStructuredFieldCandidates(db, input)
    db.close()
    return candidates
  })

  ipcMain.handle('archive:approveStructuredFieldCandidate', async (_event, payload) => {
    const { queueItemId } = queueItemIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = approveStructuredFieldCandidate(db, { queueItemId, actor: 'local-user' })
    db.close()
    return result
  })

  ipcMain.handle('archive:rejectStructuredFieldCandidate', async (_event, payload) => {
    const input = rejectReviewItemInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = rejectStructuredFieldCandidate(db, { queueItemId: input.queueItemId, actor: 'local-user', note: input.note })
    db.close()
    return result
  })

  ipcMain.handle('archive:undoStructuredFieldDecision', async (_event, payload) => {
    const { journalId } = journalIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = undoStructuredFieldDecision(db, { journalId, actor: 'local-user' })
    db.close()
    return result
  })
}
