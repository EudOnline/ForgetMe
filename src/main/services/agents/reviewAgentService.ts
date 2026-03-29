import type {
  ReviewConflictGroupSummary,
  ReviewWorkbenchListItem,
  SafeReviewGroupApprovalResult
} from '../../../shared/archiveContracts'
import {
  approveReviewItem,
  approveSafeReviewGroup,
  rejectReviewItem
} from '../reviewQueueService'
import {
  listReviewConflictGroups,
  listReviewWorkbenchItems
} from '../reviewWorkbenchReadService'
import type { AgentAdapter } from './agentTypes'

type ReviewAgentDependencies = {
  listReviewWorkbenchItems?: typeof listReviewWorkbenchItems
  listReviewConflictGroups?: typeof listReviewConflictGroups
  approveSafeReviewGroup?: typeof approveSafeReviewGroup
  approveReviewItem?: typeof approveReviewItem
  rejectReviewItem?: typeof rejectReviewItem
}

const reviewQueueItemIdPattern = /\b(?:rq-[A-Za-z0-9-]+|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})\b/i

function extractGroupKey(prompt: string) {
  const match = prompt.match(/\b(group-[A-Za-z0-9-]+)\b/i)
  if (!match) {
    throw new Error('Missing group key in prompt')
  }

  return match[1] ?? match[0]
}

function summarizeQueue(items: ReviewWorkbenchListItem[], groups: ReviewConflictGroupSummary[]) {
  return `${items.length} pending items across ${groups.length} conflict groups.`
}

function extractQueueItemId(prompt: string) {
  const match = prompt.match(reviewQueueItemIdPattern)
  if (!match) {
    throw new Error('Missing queue item id in prompt')
  }

  return match[1] ?? match[0]
}

function inferItemDecision(prompt: string): 'approve' | 'reject' {
  const value = prompt.toLowerCase()
  if (/\bapprove(?:d|ing)?\b/.test(value)) {
    return 'approve'
  }
  if (/\breject(?:ed|ing)?\b/.test(value)) {
    return 'reject'
  }

  throw new Error('Missing approve/reject decision verb in prompt')
}

export function createReviewAgentService(
  dependencies: ReviewAgentDependencies = {}
): AgentAdapter {
  const readWorkbenchItems = dependencies.listReviewWorkbenchItems ?? listReviewWorkbenchItems
  const readConflictGroups = dependencies.listReviewConflictGroups ?? listReviewConflictGroups
  const approveGroup = dependencies.approveSafeReviewGroup ?? approveSafeReviewGroup
  const approveItem = dependencies.approveReviewItem ?? approveReviewItem
  const rejectItem = dependencies.rejectReviewItem ?? rejectReviewItem

  return {
    role: 'review',
    canHandle(taskKind) {
      return [
        'review.summarize_queue',
        'review.suggest_safe_group_action',
        'review.apply_safe_group',
        'review.apply_item_decision'
      ].includes(taskKind)
    },
    async execute(context) {
      switch (context.taskKind) {
        case 'review.summarize_queue': {
          const items = readWorkbenchItems(context.db, { status: 'pending' })
          const groups = readConflictGroups(context.db)

          return {
            messages: [
              {
                sender: 'tool',
                content: `Loaded ${items.length} pending workbench items and ${groups.length} conflict groups.`
              },
              {
                sender: 'agent',
                content: summarizeQueue(items, groups)
              }
            ]
          }
        }
        case 'review.suggest_safe_group_action': {
          const items = readWorkbenchItems(context.db, { status: 'pending' })
          const groups = readConflictGroups(context.db)
          const safeGroup = groups.find((group) => !group.hasConflict && group.pendingCount >= 2)

          return {
            messages: [
              {
                sender: 'tool',
                content: `Evaluated ${items.length} pending items for safe-group opportunities.`
              },
              {
                sender: 'agent',
                content: safeGroup
                  ? `Safe group ready: ${safeGroup.groupKey} (${safeGroup.pendingCount} items).`
                  : 'No safe review group is currently ready for batch approval.'
              }
            ]
          }
        }
        case 'review.apply_safe_group': {
          if (!context.input.confirmationToken) {
            throw new Error('confirmation token required for safe-group review actions')
          }

          const groupKey = extractGroupKey(context.input.prompt)
          const result = approveGroup(context.db, {
            groupKey,
            actor: 'agent:review'
          }) as SafeReviewGroupApprovalResult

          return {
            messages: [
              {
                sender: 'tool',
                content: `Approved safe group ${result.groupKey} into batch ${result.batchId}.`
              },
              {
                sender: 'agent',
                content: `Applied safe group ${result.groupKey} with ${result.itemCount} items.`
              }
            ]
          }
        }
        case 'review.apply_item_decision': {
          if (!context.input.confirmationToken) {
            throw new Error('confirmation token required for review item actions')
          }

          const queueItemId = extractQueueItemId(context.input.prompt)
          const decision = inferItemDecision(context.input.prompt)
          if (decision === 'approve') {
            const result = approveItem(context.db, {
              queueItemId,
              actor: 'agent:review'
            })

            return {
              messages: [
                {
                  sender: 'tool',
                  content: `Approved review item ${result.queueItemId}.`
                },
                {
                  sender: 'agent',
                  content: `Approved review item ${result.queueItemId}.`
                }
              ]
            }
          }

          const result = rejectItem(context.db, {
            queueItemId,
            actor: 'agent:review',
            note: 'Rejected through Agent Console'
          })

          return {
            messages: [
              {
                sender: 'tool',
                content: `Rejected review item ${result.queueItemId}.`
              },
              {
                sender: 'agent',
                content: `Rejected review item ${result.queueItemId}.`
              }
            ]
          }
        }
      }

      throw new Error(`Unsupported review task kind: ${context.taskKind}`)
    }
  }
}
