import fs from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain, shell } from 'electron'
import {
  askMemoryWorkspaceInputSchema,
  askMemoryWorkspacePersistedInputSchema,
  exportApprovedPersonaDraftInputSchema,
  listApprovedPersonaDraftHandoffsInputSchema,
  listApprovedPersonaDraftPublicationsInputSchema,
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
  openApprovedDraftPublicationEntryInputSchema,
  publishApprovedPersonaDraftInputSchema,
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
  listApprovedPersonaDraftPublications,
  publishApprovedPersonaDraftToDirectory
} from '../services/approvedDraftPublicationService'
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

function validateApprovedDraftPublicationPackage(entryPath: string) {
  const packageRoot = path.dirname(entryPath)
  const manifestPath = path.join(packageRoot, 'manifest.json')
  const publicationPath = path.join(packageRoot, 'publication.json')

  if (!fs.existsSync(manifestPath)) {
    return `Publication package file not found: ${manifestPath}`
  }

  if (!fs.existsSync(publicationPath)) {
    return `Publication package file not found: ${publicationPath}`
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    const isValidManifest = manifest.formatVersion === 'phase10k1'
      && manifest.sourceArtifact === 'approved_persona_draft_handoff'
      && manifest.publicArtifactFileName === 'publication.json'
      && manifest.displayEntryFileName === 'index.html'
      && manifest.displayStylesFileName === 'styles.css'

    return isValidManifest ? null : `Publication package manifest is invalid: ${manifestPath}`
  } catch {
    return `Publication package manifest is invalid: ${manifestPath}`
  }
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
  ipcMain.removeHandler('archive:selectApprovedDraftPublicationDestination')
  ipcMain.removeHandler('archive:listApprovedPersonaDraftPublications')
  ipcMain.removeHandler('archive:publishApprovedPersonaDraft')
  ipcMain.removeHandler('archive:openApprovedDraftPublicationEntry')
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

  ipcMain.handle('archive:selectApprovedDraftPublicationDestination', async () => {
    return selectDirectory('FORGETME_E2E_APPROVED_DRAFT_PUBLICATION_DESTINATION_DIR')
  })

  ipcMain.handle('archive:listApprovedPersonaDraftPublications', async (_event, payload) => {
    const input = listApprovedPersonaDraftPublicationsInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const publications = listApprovedPersonaDraftPublications(db, input)
    db.close()
    return publications
  })

  ipcMain.handle('archive:publishApprovedPersonaDraft', async (_event, payload) => {
    const input = publishApprovedPersonaDraftInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)
    const published = publishApprovedPersonaDraftToDirectory(db, input)
    db.close()
    return published
  })

  ipcMain.handle('archive:openApprovedDraftPublicationEntry', async (_event, payload) => {
    const input = openApprovedDraftPublicationEntryInputSchema.parse(payload)
    const entryPath = path.normalize(input.entryPath)

    if (path.basename(entryPath) !== 'index.html') {
      return {
        status: 'failed' as const,
        entryPath,
        errorMessage: `Publication entry must be index.html: ${entryPath}`
      }
    }

    if (!fs.existsSync(entryPath)) {
      return {
        status: 'failed' as const,
        entryPath,
        errorMessage: `Publication entry file not found: ${entryPath}`
      }
    }

    const packageValidationError = validateApprovedDraftPublicationPackage(entryPath)
    if (packageValidationError) {
      return {
        status: 'failed' as const,
        entryPath,
        errorMessage: packageValidationError
      }
    }

    try {
      const errorMessage = await shell.openPath(entryPath)
      return errorMessage
        ? { status: 'failed' as const, entryPath, errorMessage }
        : { status: 'opened' as const, entryPath, errorMessage: null }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        status: 'failed' as const,
        entryPath,
        errorMessage
      }
    }
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
