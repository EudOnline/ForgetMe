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

function createRunRecord(overrides: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return {
    runId: 'run-1',
    role: 'review',
    taskKind: 'review.apply_safe_group',
    targetRole: 'review',
    assignedRoles: ['review'],
    latestAssistantResponse: null,
    status: 'running',
    executionOrigin: 'operator_manual',
    prompt: 'Summarize the review queue',
    confirmationToken: null,
    policyVersion: null,
    errorMessage: null,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...overrides
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
  it('raises a blocking challenge during review objectives when an open proposal is present', async () => {
    const db = setupDatabase()
    const agent = createReviewAgentService()

    const result = await agent.receive?.({
      db,
      objective: {
        objectiveId: 'objective-1',
        title: 'Review approval safety',
        objectiveKind: 'review_decision',
        status: 'in_progress',
        prompt: 'Decide whether this approval is safe.',
        initiatedBy: 'operator',
        ownerRole: 'review',
        mainThreadId: 'thread-1',
        riskLevel: 'medium',
        budget: null,
        requiresOperatorInput: false,
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z'
      },
      thread: {
        threadId: 'thread-1',
        objectiveId: 'objective-1',
        parentThreadId: null,
        threadKind: 'main',
        ownerRole: 'review',
        title: 'Main thread',
        status: 'open',
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
        closedAt: null
      },
      participantId: 'review',
      messages: [],
      proposals: [
        {
          proposalId: 'proposal-1',
          objectiveId: 'objective-1',
          threadId: 'thread-1',
          proposedByParticipantId: 'workspace',
          proposalKind: 'verify_external_claim',
          payload: {},
          ownerRole: 'workspace',
          status: 'under_review',
          requiredApprovals: ['workspace'],
          allowVetoBy: ['governance'],
          requiresOperatorConfirmation: false,
          toolPolicyId: 'tool-policy-web-1',
          budget: null,
          derivedFromMessageIds: [],
          artifactRefs: [],
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
          committedAt: null
        }
      ],
      round: 1
    })

    expect(result?.messages).toEqual([
      expect.objectContaining({
        kind: 'challenge',
        blocking: true
      })
    ])

    db.close()
  })

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

    expect(result.messages?.at(-1)?.content).toBe(
      'Safe review group ready for approval: group-safe-42 (4 items). Suggested follow-up: Apply safe group group-safe-42.'
    )

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

  it('routes approve item prompts to approveReviewItem', async () => {
    const db = setupDatabase()
    const approveReviewItem = vi.fn().mockReturnValue({
      status: 'approved',
      journalId: 'journal-approve-1',
      queueItemId: 'rq-1',
      candidateId: 'candidate-1'
    })
    const rejectReviewItem = vi.fn()
    const agent = createReviewAgentService({
      approveReviewItem,
      rejectReviewItem
    })

    const result = await agent.execute({
      db,
      run: createRunRecord({
        taskKind: 'review.apply_item_decision'
      }),
      input: {
        prompt: 'Approve review item rq-1',
        role: 'review',
        taskKind: 'review.apply_item_decision',
        confirmationToken: 'confirm-item-approve'
      },
      taskKind: 'review.apply_item_decision',
      assignedRoles: ['review']
    })

    expect(approveReviewItem).toHaveBeenCalledWith(db, {
      queueItemId: 'rq-1',
      actor: 'agent:review'
    })
    expect(rejectReviewItem).not.toHaveBeenCalled()
    expect(result.messages?.at(-1)?.content).toContain('rq-1')

    db.close()
  })

  it('routes uuid-based approve item prompts to approveReviewItem', async () => {
    const db = setupDatabase()
    const queueItemId = '123e4567-e89b-12d3-a456-426614174000'
    const approveReviewItem = vi.fn().mockReturnValue({
      status: 'approved',
      journalId: 'journal-approve-uuid-1',
      queueItemId,
      candidateId: 'candidate-uuid-1'
    })
    const rejectReviewItem = vi.fn()
    const agent = createReviewAgentService({
      approveReviewItem,
      rejectReviewItem
    })

    const result = await agent.execute({
      db,
      run: createRunRecord({
        taskKind: 'review.apply_item_decision'
      }),
      input: {
        prompt: `Approve review item ${queueItemId}`,
        role: 'review',
        taskKind: 'review.apply_item_decision',
        confirmationToken: 'confirm-item-approve-uuid'
      },
      taskKind: 'review.apply_item_decision',
      assignedRoles: ['review']
    })

    expect(approveReviewItem).toHaveBeenCalledWith(db, {
      queueItemId,
      actor: 'agent:review'
    })
    expect(rejectReviewItem).not.toHaveBeenCalled()
    expect(result.messages?.at(-1)?.content).toContain(queueItemId)

    db.close()
  })

  it('routes reject item prompts to rejectReviewItem with a stable default note', async () => {
    const db = setupDatabase()
    const approveReviewItem = vi.fn()
    const rejectReviewItem = vi.fn().mockReturnValue({
      status: 'rejected',
      journalId: 'journal-reject-1',
      queueItemId: 'rq-2',
      candidateId: 'candidate-2'
    })
    const agent = createReviewAgentService({
      approveReviewItem,
      rejectReviewItem
    })

    const result = await agent.execute({
      db,
      run: createRunRecord({
        taskKind: 'review.apply_item_decision'
      }),
      input: {
        prompt: 'Reject review item rq-2',
        role: 'review',
        taskKind: 'review.apply_item_decision',
        confirmationToken: 'confirm-item-reject'
      },
      taskKind: 'review.apply_item_decision',
      assignedRoles: ['review']
    })

    expect(rejectReviewItem).toHaveBeenCalledWith(db, {
      queueItemId: 'rq-2',
      actor: 'agent:review',
      note: 'Rejected through objective runtime'
    })
    expect(approveReviewItem).not.toHaveBeenCalled()
    expect(result.messages?.at(-1)?.content).toContain('rq-2')

    db.close()
  })

  it('refuses to apply an item decision without an explicit confirmation token', async () => {
    const db = setupDatabase()
    const approveReviewItem = vi.fn()
    const rejectReviewItem = vi.fn()
    const agent = createReviewAgentService({
      approveReviewItem,
      rejectReviewItem
    })

    await expect(agent.execute({
      db,
      run: createRunRecord({
        taskKind: 'review.apply_item_decision'
      }),
      input: {
        prompt: 'Approve review item rq-1',
        role: 'review',
        taskKind: 'review.apply_item_decision'
      },
      taskKind: 'review.apply_item_decision',
      assignedRoles: ['review']
    })).rejects.toThrow(/confirmation token/i)
    expect(approveReviewItem).not.toHaveBeenCalled()
    expect(rejectReviewItem).not.toHaveBeenCalled()

    db.close()
  })
})
