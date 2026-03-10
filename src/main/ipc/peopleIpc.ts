import path from 'node:path'
import { ipcMain } from 'electron'
import { canonicalPersonIdSchema, relationshipLabelInputSchema } from '../../shared/ipcSchemas'
import type { AppPaths } from '../services/appPaths'
import { openDatabase, runMigrations } from '../services/db'
import { getPersonGraph, setRelationshipLabel } from '../services/graphService'
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
}
