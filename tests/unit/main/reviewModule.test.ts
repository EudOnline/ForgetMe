import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppPaths } from '../../../src/main/services/appPaths'

const {
  openDatabase,
  runMigrations,
  listReviewQueue,
  approveSafeReviewGroup,
  rejectReviewItem,
  undoDecision,
  searchDecisionJournal
} = vi.hoisted(() => ({
  openDatabase: vi.fn(),
  runMigrations: vi.fn(),
  listReviewQueue: vi.fn(),
  approveSafeReviewGroup: vi.fn(),
  rejectReviewItem: vi.fn(),
  undoDecision: vi.fn(),
  searchDecisionJournal: vi.fn()
}))

vi.mock('../../../src/main/services/db', () => ({
  openDatabase,
  runMigrations
}))

vi.mock('../../../src/main/services/reviewQueueService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/main/services/reviewQueueService')>()
  return {
    ...actual,
    listReviewQueue,
    approveSafeReviewGroup,
    rejectReviewItem,
    undoDecision
  }
})

vi.mock('../../../src/main/services/searchService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/main/services/searchService')>()
  return {
    ...actual,
    searchDecisionJournal
  }
})

import { createReviewModule } from '../../../src/main/modules/review/runtime/createReviewModule'

function appPathsFixture(): AppPaths {
  return {
    root: '/tmp/forgetme',
    sqliteDir: '/tmp/forgetme/sqlite',
    vaultDir: '/tmp/forgetme/vault',
    vaultOriginalsDir: '/tmp/forgetme/vault/originals',
    importReportsDir: '/tmp/forgetme/reports',
    preservationReportsDir: '/tmp/forgetme/preservation-reports'
  }
}

describe('createReviewModule', () => {
  beforeEach(() => {
    openDatabase.mockReset()
    runMigrations.mockReset()
    listReviewQueue.mockReset()
    approveSafeReviewGroup.mockReset()
    rejectReviewItem.mockReset()
    undoDecision.mockReset()
    searchDecisionJournal.mockReset()
  })

  it('lists review queue items through a module-owned database helper', async () => {
    const close = vi.fn()
    const db = { close }
    const queueItems = [{ id: 'rq-1' }]

    openDatabase.mockReturnValue(db)
    listReviewQueue.mockReturnValue(queueItems)

    const reviewModule = createReviewModule(appPathsFixture())
    const result = await reviewModule.listQueue({
      status: 'pending'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalledWith(db)
    expect(listReviewQueue).toHaveBeenCalledWith(db, {
      status: 'pending'
    })
    expect(result).toEqual(queueItems)
    expect(close).toHaveBeenCalled()
  })

  it('searches decision journal through app-path scoped services', async () => {
    const searchResults = [{ journalId: 'journal-1' }]
    searchDecisionJournal.mockResolvedValue(searchResults)

    const reviewModule = createReviewModule(appPathsFixture())
    const result = await reviewModule.searchDecisionJournal({
      query: 'safe approval'
    })

    expect(searchDecisionJournal).toHaveBeenCalledWith({
      appPaths: appPathsFixture(),
      query: 'safe approval'
    })
    expect(result).toEqual(searchResults)
  })

  it('owns the review actor for mutation flows', async () => {
    const close = vi.fn()
    const db = { close }

    openDatabase.mockReturnValue(db)
    approveSafeReviewGroup.mockReturnValue({ status: 'approved' })
    rejectReviewItem.mockReturnValue({ status: 'rejected' })
    undoDecision.mockReturnValue({ status: 'undone' })

    const reviewModule = createReviewModule(appPathsFixture())

    await reviewModule.approveSafeGroup({ groupKey: 'safe-group-1' })
    await reviewModule.rejectItem({ queueItemId: 'rq-1', note: 'need manual review' })
    await reviewModule.undoDecision({ journalId: 'journal-1' })

    expect(approveSafeReviewGroup).toHaveBeenCalledWith(db, {
      groupKey: 'safe-group-1',
      actor: 'local-user'
    })
    expect(rejectReviewItem).toHaveBeenCalledWith(db, {
      queueItemId: 'rq-1',
      note: 'need manual review',
      actor: 'local-user'
    })
    expect(undoDecision).toHaveBeenCalledWith(db, {
      journalId: 'journal-1',
      actor: 'local-user'
    })
    expect(close).toHaveBeenCalledTimes(3)
  })
})
