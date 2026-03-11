import path from 'node:path'
import { ipcMain } from 'electron'
import { canonicalPersonIdSchema, journalIdSchema, personProfileAttributeFilterSchema, profileAttributeCandidateFilterSchema, queueItemIdSchema, rejectReviewItemInputSchema, relationshipLabelInputSchema } from '../../shared/ipcSchemas'
import type { AppPaths } from '../services/appPaths'
import { openDatabase, runMigrations } from '../services/db'
import { getPersonGraph, setRelationshipLabel } from '../services/graphService'
import { approveProfileAttributeCandidate, rejectProfileAttributeCandidate, undoProfileAttributeDecision } from '../services/profileCandidateReviewService'
import { listPersonProfileAttributes, listProfileAttributeCandidates } from '../services/profileReadService'
import { getCanonicalPerson, getPeopleList, getPersonTimeline } from '../services/timelineService'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

export function registerPeopleIpc(appPaths: AppPaths) {
  ipcMain.removeHandler('archive:listCanonicalPeople')
  ipcMain.removeHandler('archive:getCanonicalPerson')
  ipcMain.removeHandler('archive:getPersonTimeline')
  ipcMain.removeHandler('archive:getPersonGraph')
  ipcMain.removeHandler('archive:setRelationshipLabel')
  ipcMain.removeHandler('archive:listPersonProfileAttributes')
  ipcMain.removeHandler('archive:listProfileAttributeCandidates')
  ipcMain.removeHandler('archive:approveProfileAttributeCandidate')
  ipcMain.removeHandler('archive:rejectProfileAttributeCandidate')
  ipcMain.removeHandler('archive:undoProfileAttributeDecision')

  ipcMain.handle('archive:listCanonicalPeople', async () => {
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const people = getPeopleList(db)
    db.close()
    return people
  })

  ipcMain.handle('archive:getCanonicalPerson', async (_event, payload) => {
    const { canonicalPersonId } = canonicalPersonIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const person = getCanonicalPerson(db, { canonicalPersonId })
    db.close()
    return person
  })

  ipcMain.handle('archive:getPersonTimeline', async (_event, payload) => {
    const { canonicalPersonId } = canonicalPersonIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const timeline = getPersonTimeline(db, { canonicalPersonId })
    db.close()
    return timeline
  })

  ipcMain.handle('archive:getPersonGraph', async (_event, payload) => {
    const { canonicalPersonId } = canonicalPersonIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const graph = getPersonGraph(db, { canonicalPersonId })
    db.close()
    return graph
  })

  ipcMain.handle('archive:setRelationshipLabel', async (_event, payload) => {
    const input = relationshipLabelInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = setRelationshipLabel(db, input)
    db.close()
    return result
  })

  ipcMain.handle('archive:listPersonProfileAttributes', async (_event, payload) => {
    const input = personProfileAttributeFilterSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const attributes = listPersonProfileAttributes(db, input)
    db.close()
    return attributes
  })

  ipcMain.handle('archive:listProfileAttributeCandidates', async (_event, payload) => {
    const input = profileAttributeCandidateFilterSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const candidates = listProfileAttributeCandidates(db, input)
    db.close()
    return candidates
  })

  ipcMain.handle('archive:approveProfileAttributeCandidate', async (_event, payload) => {
    const { queueItemId } = queueItemIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = approveProfileAttributeCandidate(db, { queueItemId, actor: 'local-user' })
    db.close()
    return result
  })

  ipcMain.handle('archive:rejectProfileAttributeCandidate', async (_event, payload) => {
    const input = rejectReviewItemInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = rejectProfileAttributeCandidate(db, { queueItemId: input.queueItemId, actor: 'local-user', note: input.note })
    db.close()
    return result
  })

  ipcMain.handle('archive:undoProfileAttributeDecision', async (_event, payload) => {
    const { journalId } = journalIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const result = undoProfileAttributeDecision(db, { journalId, actor: 'local-user' })
    db.close()
    return result
  })
}
