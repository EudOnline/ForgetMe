import fs from 'node:fs'
import path from 'node:path'
import { dialog, shell } from 'electron'
import type { AppPaths } from '../../../services/appPaths'
import { openDatabase, runMigrations } from '../../../services/db'
import {
  getMemoryWorkspaceCompareMatrix,
  listMemoryWorkspaceCompareMatrices,
  runMemoryWorkspaceCompareMatrix
} from '../../../services/memoryWorkspaceCompareMatrixService'
import {
  getMemoryWorkspaceCompareSession,
  listMemoryWorkspaceCompareSessions,
  runMemoryWorkspaceCompare
} from '../../../services/memoryWorkspaceCompareService'
import { askMemoryWorkspace } from '../../../services/memoryWorkspaceService'
import {
  askMemoryWorkspacePersisted,
  getMemoryWorkspaceSession,
  listMemoryWorkspaceSessions
} from '../../../services/memoryWorkspaceSessionService'
import {
  createPersonaDraftReviewFromTurn,
  getPersonaDraftReviewByTurn,
  transitionPersonaDraftReview,
  updatePersonaDraftReview
} from '../../../services/memoryWorkspaceDraftReviewService'
import {
  exportApprovedPersonaDraftToDirectory,
  listApprovedPersonaDraftHandoffs
} from '../../../services/personaDraftHandoffService'
import {
  listApprovedPersonaDraftPublications,
  publishApprovedPersonaDraftToDirectory,
  validateApprovedDraftPublicationEntryPath
} from '../../../services/approvedDraftPublicationService'
import {
  createApprovedPersonaDraftHostedShareLink,
  getApprovedDraftHostedShareHostStatus,
  listApprovedPersonaDraftHostedShareLinks,
  revokeApprovedPersonaDraftHostedShareLink
} from '../../../services/approvedDraftHostedShareLinkService'
import {
  listApprovedPersonaDraftProviderSends,
  retryApprovedPersonaDraftProviderSend,
  sendApprovedPersonaDraftToProvider
} from '../../../services/approvedDraftProviderSendService'
import { listApprovedDraftSendDestinations } from '../../../services/approvedDraftSendDestinationService'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

function openArchiveDatabase(appPaths: AppPaths) {
  const db = openDatabase(databasePath(appPaths))
  runMigrations(db)
  return db
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

export function createWorkspaceModule(appPaths: AppPaths) {
  return {
    async withArchiveDatabase<T>(
      work: (db: ReturnType<typeof openArchiveDatabase>) => Promise<T> | T
    ) {
      const db = openArchiveDatabase(appPaths)

      try {
        return await work(db)
      } finally {
        db.close()
      }
    },
    async ask(input: Parameters<typeof askMemoryWorkspace>[1]) {
      return this.withArchiveDatabase((db) => askMemoryWorkspace(db, input))
    },
    async listSessions(input: Parameters<typeof listMemoryWorkspaceSessions>[1]) {
      return this.withArchiveDatabase((db) => listMemoryWorkspaceSessions(db, input))
    },
    async getSession(input: Parameters<typeof getMemoryWorkspaceSession>[1]) {
      return this.withArchiveDatabase((db) => getMemoryWorkspaceSession(db, input))
    },
    async askPersisted(input: Parameters<typeof askMemoryWorkspacePersisted>[1]) {
      return this.withArchiveDatabase((db) => askMemoryWorkspacePersisted(db, input))
    },
    async runCompare(input: Parameters<typeof runMemoryWorkspaceCompare>[1]) {
      return this.withArchiveDatabase((db) => runMemoryWorkspaceCompare(db, input))
    },
    async listCompareSessions(input: Parameters<typeof listMemoryWorkspaceCompareSessions>[1]) {
      return this.withArchiveDatabase((db) => listMemoryWorkspaceCompareSessions(db, input))
    },
    async getCompareSession(input: Parameters<typeof getMemoryWorkspaceCompareSession>[1]) {
      return this.withArchiveDatabase((db) => getMemoryWorkspaceCompareSession(db, input))
    },
    async runCompareMatrix(input: Parameters<typeof runMemoryWorkspaceCompareMatrix>[1]) {
      return this.withArchiveDatabase((db) => runMemoryWorkspaceCompareMatrix(db, input))
    },
    async listCompareMatrices() {
      return this.withArchiveDatabase((db) => listMemoryWorkspaceCompareMatrices(db))
    },
    async getCompareMatrix(input: Parameters<typeof getMemoryWorkspaceCompareMatrix>[1]) {
      return this.withArchiveDatabase((db) => getMemoryWorkspaceCompareMatrix(db, input))
    },
    async getDraftReviewByTurn(input: Parameters<typeof getPersonaDraftReviewByTurn>[1]) {
      return this.withArchiveDatabase((db) => getPersonaDraftReviewByTurn(db, input))
    },
    async createDraftReviewFromTurn(input: Parameters<typeof createPersonaDraftReviewFromTurn>[1]) {
      return this.withArchiveDatabase((db) => createPersonaDraftReviewFromTurn(db, input))
    },
    async updateDraftReview(input: Parameters<typeof updatePersonaDraftReview>[1]) {
      return this.withArchiveDatabase((db) => updatePersonaDraftReview(db, input))
    },
    async transitionDraftReview(input: Parameters<typeof transitionPersonaDraftReview>[1]) {
      return this.withArchiveDatabase((db) => transitionPersonaDraftReview(db, input))
    },
    async selectDraftHandoffDestination() {
      return selectDirectory('FORGETME_E2E_PERSONA_DRAFT_HANDOFF_DESTINATION_DIR')
    },
    async listApprovedDraftHandoffs(input: Parameters<typeof listApprovedPersonaDraftHandoffs>[1]) {
      return this.withArchiveDatabase((db) => listApprovedPersonaDraftHandoffs(db, input))
    },
    async exportApprovedDraft(input: Parameters<typeof exportApprovedPersonaDraftToDirectory>[1]) {
      return this.withArchiveDatabase((db) => exportApprovedPersonaDraftToDirectory(db, input))
    },
    async selectPublicationDestination() {
      return selectDirectory('FORGETME_E2E_APPROVED_DRAFT_PUBLICATION_DESTINATION_DIR')
    },
    async listApprovedDraftPublications(input: Parameters<typeof listApprovedPersonaDraftPublications>[1]) {
      return this.withArchiveDatabase((db) => listApprovedPersonaDraftPublications(db, input))
    },
    async publishApprovedDraft(input: Parameters<typeof publishApprovedPersonaDraftToDirectory>[1]) {
      return this.withArchiveDatabase((db) => publishApprovedPersonaDraftToDirectory(db, input))
    },
    async openApprovedDraftPublicationEntry(input: { entryPath: string }) {
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

      const packageValidationError = validateApprovedDraftPublicationEntryPath(entryPath)
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
        return {
          status: 'failed' as const,
          entryPath,
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      }
    },
    async getHostedShareHostStatus() {
      return getApprovedDraftHostedShareHostStatus()
    },
    async listHostedShareLinks(input: Parameters<typeof listApprovedPersonaDraftHostedShareLinks>[1]) {
      return this.withArchiveDatabase((db) => listApprovedPersonaDraftHostedShareLinks(db, input))
    },
    async createHostedShareLink(input: Parameters<typeof createApprovedPersonaDraftHostedShareLink>[1]) {
      return this.withArchiveDatabase((db) => createApprovedPersonaDraftHostedShareLink(db, input))
    },
    async revokeHostedShareLink(input: Parameters<typeof revokeApprovedPersonaDraftHostedShareLink>[1]) {
      return this.withArchiveDatabase((db) => revokeApprovedPersonaDraftHostedShareLink(db, input))
    },
    async openHostedShareLink(input: { shareUrl: string }) {
      try {
        await shell.openExternal(input.shareUrl)
        return {
          status: 'opened' as const,
          shareUrl: input.shareUrl,
          errorMessage: null
        }
      } catch (error) {
        return {
          status: 'failed' as const,
          shareUrl: input.shareUrl,
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      }
    },
    async listSendDestinations() {
      return listApprovedDraftSendDestinations()
    },
    async listProviderSends(input: Parameters<typeof listApprovedPersonaDraftProviderSends>[1]) {
      return this.withArchiveDatabase((db) => listApprovedPersonaDraftProviderSends(db, input))
    },
    async sendToProvider(input: Parameters<typeof sendApprovedPersonaDraftToProvider>[1]) {
      return this.withArchiveDatabase((db) => sendApprovedPersonaDraftToProvider(db, input))
    },
    async retryProviderSend(input: Parameters<typeof retryApprovedPersonaDraftProviderSend>[1]) {
      return this.withArchiveDatabase((db) => retryApprovedPersonaDraftProviderSend(db, input))
    }
  }
}
