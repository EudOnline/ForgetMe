import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AgentRunRecord, ReviewConflictGroupSummary, ReviewWorkbenchListItem, SafeReviewGroupApprovalResult } from '../../../src/shared/archiveContracts'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createReviewAgentService } from '../../../src/main/services/agents/reviewAgentService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-review-agent-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function createRunRecord(): AgentRunRecord {
  return {
    runId: 'run-1',
    role: 'review',
    taskKind: 'review.apply_safe_group',
    status: 'running',
    prompt: 'Summarize the review queue',
    confirmationToken: null,
    policyVersion: null,
    errorMessage: null,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z'
  }
}

function createWorkbenchItem(overrides: Partial<ReviewWorkbenchListItem> = {}): ReviewWorkbenchListItem {
  return {
    queueItemId: 'queue-1',
    itemType: 'profile_attribute_candidate',
    candidateId: 'candidate-1',
    status: 'pending',
    priority: 1,
    confidence: 0.9,
    summary: {},
    canonicalPersonId: 'person-1',
    canonicalPersonName: 'Alice',
    fieldKey: 'profile.name',
    displayValue: 'Alice',
    hasConflict: false,
    createdAt: '2026-03-29T00:00:00.000Z',
    reviewedAt: null,
    ...overrides
  }
}

function createConflictGroup(overrides: Partial<ReviewConflictGroupSummary> = {}): ReviewConflictGroupSummary {
  return {
    groupKey: 'group-safe-1',
    canonicalPersonId: 'person-1',
    canonicalPersonName: 'Alice',
    itemType: 'profile_attribute_candidate',
    fieldKey: 'profile.name',
    pendingCount: 3,
    distinctValues: ['Alice'],
    hasConflict: false,
    nextQueueItemId: 'queue-1',
    latestPendingCreatedAt: '2026-03-29T00:00:00.000Z',
    ...overrides
  }
}

describe('review agent service', () => {
  it('reads queue and workbench state to summarize pending review work', async () => {
    const db = setupDatabase()
    const listReviewWorkbenchItems = vi.fn().mockReturnValue([
      createWorkbenchItem(),
      createWorkbenchItem({
        queueItemId: 'queue-2',
        candidateId: 'candidate-2'
      })
    ])
    const listReviewConflictGroups = vi.fn().mockReturnValue([
      createConflictGroup()
    ])
    const agent = createReviewAgentService({
      listReviewWorkbenchItems,
      listReviewConflictGroups
    })

    const result = await agent.execute({
      db,
      run: createRunRecord(),
      input: {
        prompt: 'Summarize the review queue',
        role: 'review',
        taskKind: 'review.summarize_queue'
      },
      taskKind: 'review.summarize_queue',
      assignedRoles: ['review']
    })

    expect(listReviewWorkbenchItems).toHaveBeenCalledWith(db, { status: 'pending' })
    expect(listReviewConflictGroups).toHaveBeenCalledWith(db)
    expect(result.messages?.at(-1)?.content).toContain('2 pending items')

    db.close()
  })

  it('identifies safe-group opportunities before applying them', async () => {
    const db = setupDatabase()
    const listReviewWorkbenchItems = vi.fn().mockReturnValue([createWorkbenchItem()])
    const listReviewConflictGroups = vi.fn().mockReturnValue([
      createConflictGroup({
        groupKey: 'group-safe-42',
        pendingCount: 4,
        hasConflict: false
      })
    ])
    const agent = createReviewAgentService({
      listReviewWorkbenchItems,
      listReviewConflictGroups
    })

    const result = await agent.execute({
      db,
      run: createRunRecord(),
      input: {
        prompt: 'Suggest a safe group action',
        role: 'review',
        taskKind: 'review.suggest_safe_group_action'
      },
      taskKind: 'review.suggest_safe_group_action',
      assignedRoles: ['review']
    })

    expect(result.messages?.some((message) => message.content.includes('group-safe-42'))).toBe(true)

    db.close()
  })

  it('refuses to apply a safe group without an explicit confirmation token', async () => {
    const db = setupDatabase()
    const approveSafeReviewGroup = vi.fn().mockReturnValue({
      status: 'approved',
      batchId: 'batch-1',
      journalId: 'journal-1',
      groupKey: 'group-safe-1',
      itemCount: 3,
      canonicalPersonId: 'person-1',
      canonicalPersonName: 'Alice',
      itemType: 'profile_attribute_candidate',
      fieldKey: 'profile.name',
      queueItemIds: ['queue-1', 'queue-2', 'queue-3']
    } satisfies SafeReviewGroupApprovalResult)
    const agent = createReviewAgentService({
      approveSafeReviewGroup
    })

    await expect(agent.execute({
      db,
      run: createRunRecord(),
      input: {
        prompt: 'Apply safe group group-safe-1',
        role: 'review',
        taskKind: 'review.apply_safe_group'
      },
      taskKind: 'review.apply_safe_group',
      assignedRoles: ['review']
    })).rejects.toThrow(/confirmation token/i)
    expect(approveSafeReviewGroup).not.toHaveBeenCalled()

    db.close()
  })
})
