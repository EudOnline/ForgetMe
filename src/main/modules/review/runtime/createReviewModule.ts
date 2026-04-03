import path from 'node:path'
import type { AppPaths } from '../../../services/appPaths'
import { openDatabase, runMigrations } from '../../../services/db'
import {
  approveReviewItem,
  approveSafeReviewGroup,
  listDecisionJournal,
  listReviewQueue,
  rejectReviewItem,
  undoDecision
} from '../../../services/reviewQueueService'
import {
  getReviewWorkbenchItem,
  listReviewConflictGroups,
  listReviewInboxPeople,
  listReviewWorkbenchItems
} from '../../../services/reviewWorkbenchReadService'
import { searchDecisionJournal } from '../../../services/searchService'

type ApproveSafeGroupInput = Omit<Parameters<typeof approveSafeReviewGroup>[1], 'actor'>
type RejectReviewItemInput = Omit<Parameters<typeof rejectReviewItem>[1], 'actor'>
type UndoDecisionInput = Omit<Parameters<typeof undoDecision>[1], 'actor'>

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

function openArchiveDatabase(appPaths: AppPaths) {
  const db = openDatabase(databasePath(appPaths))
  runMigrations(db)
  return db
}

export function createReviewModule(appPaths: AppPaths) {
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
    async listQueue(input: Parameters<typeof listReviewQueue>[1]) {
      return this.withArchiveDatabase((db) => listReviewQueue(db, input))
    },
    async listDecisionJournal(input: Parameters<typeof listDecisionJournal>[1]) {
      return this.withArchiveDatabase((db) => listDecisionJournal(db, input))
    },
    async listInboxPeople() {
      return this.withArchiveDatabase((db) => listReviewInboxPeople(db))
    },
    async listConflictGroups() {
      return this.withArchiveDatabase((db) => listReviewConflictGroups(db))
    },
    async listWorkbenchItems(input: Parameters<typeof listReviewWorkbenchItems>[1]) {
      return this.withArchiveDatabase((db) => listReviewWorkbenchItems(db, input))
    },
    async getWorkbenchItem(input: Parameters<typeof getReviewWorkbenchItem>[1]) {
      return this.withArchiveDatabase((db) => {
        try {
          return getReviewWorkbenchItem(db, input)
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('Review queue item not found:')) {
            return null
          }
          throw error
        }
      })
    },
    async approveItem(input: { queueItemId: string }) {
      return this.withArchiveDatabase((db) => approveReviewItem(db, {
        ...input,
        actor: 'local-user'
      }))
    },
    async approveSafeGroup(input: ApproveSafeGroupInput) {
      return this.withArchiveDatabase((db) => approveSafeReviewGroup(db, {
        ...input,
        actor: 'local-user'
      }))
    },
    async rejectItem(input: RejectReviewItemInput) {
      return this.withArchiveDatabase((db) => rejectReviewItem(db, {
        ...input,
        actor: 'local-user'
      }))
    },
    async undoDecision(input: UndoDecisionInput) {
      return this.withArchiveDatabase((db) => undoDecision(db, {
        ...input,
        actor: 'local-user'
      }))
    },
    async searchDecisionJournal(input: Parameters<typeof searchDecisionJournal>[0] extends infer T
      ? Omit<Extract<T, object>, 'appPaths'>
      : never) {
      return searchDecisionJournal({
        appPaths,
        ...input
      })
    }
  }
}
