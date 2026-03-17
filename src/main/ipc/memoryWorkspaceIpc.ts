import path from 'node:path'
import { dialog, ipcMain } from 'electron'
import {
  askMemoryWorkspaceInputSchema,
  askMemoryWorkspacePersistedInputSchema,
  exportApprovedPersonaDraftInputSchema,
  listApprovedPersonaDraftHandoffsInputSchema,
  listApprovedPersonaDraftProviderSendsInputSchema,
  createPersonaDraftReviewFromTurnInputSchema,
  getPersonaDraftReviewByTurnInputSchema,
  memoryWorkspaceCompareMatrixIdSchema,
  memoryWorkspaceCompareSessionFilterSchema,
  memoryWorkspaceCompareSessionIdSchema,
  memoryWorkspaceSessionFilterSchema,
  memoryWorkspaceSessionIdSchema,
  retryApprovedPersonaDraftProviderSendInputSchema,
  runMemoryWorkspaceCompareInputSchema,
  runMemoryWorkspaceCompareMatrixInputSchema,
  sendApprovedPersonaDraftToProviderInputSchema,
  transitionPersonaDraftReviewInputSchema,
  updatePersonaDraftReviewInputSchema
} from '../../shared/ipcSchemas'
import type { AppPaths } from '../services/appPaths'
import { openDatabase, runMigrations } from '../services/db'
import {
  getMemoryWorkspaceCompareMatrix,
  listMemoryWorkspaceCompareMatrices,
  runMemoryWorkspaceCompareMatrix
} from '../services/memoryWorkspaceCompareMatrixService'
import {
  getMemoryWorkspaceCompareSession,
  listMemoryWorkspaceCompareSessions,
  runMemoryWorkspaceCompare
} from '../services/memoryWorkspaceCompareService'
import { askMemoryWorkspace } from '../services/memoryWorkspaceService'
import {
  askMemoryWorkspacePersisted,
  getMemoryWorkspaceSession,
  listMemoryWorkspaceSessions
} from '../services/memoryWorkspaceSessionService'
import {
  createPersonaDraftReviewFromTurn,
  getPersonaDraftReviewByTurn,
  transitionPersonaDraftReview,
  updatePersonaDraftReview
} from '../services/memoryWorkspaceDraftReviewService'
import {
  exportApprovedPersonaDraftToDirectory,
  listApprovedPersonaDraftHandoffs
} from '../services/personaDraftHandoffService'
import {
  listApprovedPersonaDraftProviderSends,
  retryApprovedPersonaDraftProviderSend,
  sendApprovedPersonaDraftToProvider
} from '../services/approvedDraftProviderSendService'
import { listApprovedDraftSendDestinations } from '../services/approvedDraftSendDestinationService'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

async function selectDirectory(envKey: string) {
  const envValue = process.env[envKey]
  if (envValue) {
    return envValue
  }

  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })

  return result.canceled ? null : result.filePaths[0] ?? null
}

export function registerMemoryWorkspaceIpc(appPaths: AppPaths) {
  ipcMain.removeHandler('archive:askMemoryWorkspace')
  ipcMain.removeHandler('archive:listMemoryWorkspaceSessions')
  ipcMain.removeHandler('archive:getMemoryWorkspaceSession')
  ipcMain.removeHandler('archive:askMemoryWorkspacePersisted')
  ipcMain.removeHandler('archive:runMemoryWorkspaceCompare')
  ipcMain.removeHandler('archive:listMemoryWorkspaceCompareSessions')
  ipcMain.removeHandler('archive:getMemoryWorkspaceCompareSession')
  ipcMain.removeHandler('archive:runMemoryWorkspaceCompareMatrix')
  ipcMain.removeHandler('archive:listMemoryWorkspaceCompareMatrices')
  ipcMain.removeHandler('archive:getMemoryWorkspaceCompareMatrix')
  ipcMain.removeHandler('archive:getPersonaDraftReviewByTurn')
  ipcMain.removeHandler('archive:createPersonaDraftReviewFromTurn')
  ipcMain.removeHandler('archive:updatePersonaDraftReview')
  ipcMain.removeHandler('archive:transitionPersonaDraftReview')
  ipcMain.removeHandler('archive:selectPersonaDraftHandoffDestination')
  ipcMain.removeHandler('archive:listApprovedPersonaDraftHandoffs')
  ipcMain.removeHandler('archive:exportApprovedPersonaDraft')
  ipcMain.removeHandler('archive:listApprovedDraftSendDestinations')
  ipcMain.removeHandler('archive:listApprovedPersonaDraftProviderSends')
  ipcMain.removeHandler('archive:sendApprovedPersonaDraftToProvider')
  ipcMain.removeHandler('archive:retryApprovedPersonaDraftProviderSend')

  ipcMain.handle('archive:askMemoryWorkspace', async (_event, payload) => {
    const input = askMemoryWorkspaceInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const response = askMemoryWorkspace(db, input)
    db.close()
    return response
  })

  ipcMain.handle('archive:listMemoryWorkspaceSessions', async (_event, payload) => {
    const input = memoryWorkspaceSessionFilterSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const sessions = listMemoryWorkspaceSessions(db, input)
    db.close()
    return sessions
  })

  ipcMain.handle('archive:getMemoryWorkspaceSession', async (_event, payload) => {
    const input = memoryWorkspaceSessionIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const session = getMemoryWorkspaceSession(db, input)
    db.close()
    return session
  })

  ipcMain.handle('archive:askMemoryWorkspacePersisted', async (_event, payload) => {
    const input = askMemoryWorkspacePersistedInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const turn = askMemoryWorkspacePersisted(db, input)
    db.close()
    return turn
  })

  ipcMain.handle('archive:runMemoryWorkspaceCompare', async (_event, payload) => {
    const input = runMemoryWorkspaceCompareInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const session = await runMemoryWorkspaceCompare(db, input)
    db.close()
    return session
  })

  ipcMain.handle('archive:listMemoryWorkspaceCompareSessions', async (_event, payload) => {
    const input = memoryWorkspaceCompareSessionFilterSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const sessions = listMemoryWorkspaceCompareSessions(db, input)
    db.close()
    return sessions
  })

  ipcMain.handle('archive:getMemoryWorkspaceCompareSession', async (_event, payload) => {
    const input = memoryWorkspaceCompareSessionIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const session = getMemoryWorkspaceCompareSession(db, input)
    db.close()
    return session
  })

  ipcMain.handle('archive:runMemoryWorkspaceCompareMatrix', async (_event, payload) => {
    const input = runMemoryWorkspaceCompareMatrixInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const matrix = await runMemoryWorkspaceCompareMatrix(db, input)
    db.close()
    return matrix
  })

  ipcMain.handle('archive:listMemoryWorkspaceCompareMatrices', async () => {
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const matrices = listMemoryWorkspaceCompareMatrices(db)
    db.close()
    return matrices
  })

  ipcMain.handle('archive:getMemoryWorkspaceCompareMatrix', async (_event, payload) => {
    const input = memoryWorkspaceCompareMatrixIdSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const matrix = getMemoryWorkspaceCompareMatrix(db, input)
    db.close()
    return matrix
  })

  ipcMain.handle('archive:getPersonaDraftReviewByTurn', async (_event, payload) => {
    const input = getPersonaDraftReviewByTurnInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const review = getPersonaDraftReviewByTurn(db, input)
    db.close()
    return review
  })

  ipcMain.handle('archive:createPersonaDraftReviewFromTurn', async (_event, payload) => {
    const input = createPersonaDraftReviewFromTurnInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const review = createPersonaDraftReviewFromTurn(db, input)
    db.close()
    return review
  })

  ipcMain.handle('archive:updatePersonaDraftReview', async (_event, payload) => {
    const input = updatePersonaDraftReviewInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const review = updatePersonaDraftReview(db, input)
    db.close()
    return review
  })

  ipcMain.handle('archive:transitionPersonaDraftReview', async (_event, payload) => {
    const input = transitionPersonaDraftReviewInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const review = transitionPersonaDraftReview(db, input)
    db.close()
    return review
  })

  ipcMain.handle('archive:selectPersonaDraftHandoffDestination', async () => {
    return selectDirectory('FORGETME_E2E_PERSONA_DRAFT_HANDOFF_DESTINATION_DIR')
  })

  ipcMain.handle('archive:listApprovedPersonaDraftHandoffs', async (_event, payload) => {
    const input = listApprovedPersonaDraftHandoffsInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const handoffs = listApprovedPersonaDraftHandoffs(db, input)
    db.close()
    return handoffs
  })

  ipcMain.handle('archive:exportApprovedPersonaDraft', async (_event, payload) => {
    const input = exportApprovedPersonaDraftInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const exported = exportApprovedPersonaDraftToDirectory(db, input)
    db.close()
    return exported
  })

  ipcMain.handle('archive:listApprovedDraftSendDestinations', async () => {
    return listApprovedDraftSendDestinations()
  })

  ipcMain.handle('archive:listApprovedPersonaDraftProviderSends', async (_event, payload) => {
    const input = listApprovedPersonaDraftProviderSendsInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const sends = listApprovedPersonaDraftProviderSends(db, input)
    db.close()
    return sends
  })

  ipcMain.handle('archive:sendApprovedPersonaDraftToProvider', async (_event, payload) => {
    const input = sendApprovedPersonaDraftToProviderInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const sent = await sendApprovedPersonaDraftToProvider(db, input)
    db.close()
    return sent
  })

  ipcMain.handle('archive:retryApprovedPersonaDraftProviderSend', async (_event, payload) => {
    const input = retryApprovedPersonaDraftProviderSendInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const retried = await retryApprovedPersonaDraftProviderSend(db, input)
    db.close()
    return retried
  })
}
