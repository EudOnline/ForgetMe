import type {
  ReviewConflictGroupSummary,
  ReviewWorkbenchListItem,
  SafeReviewGroupApprovalResult
} from '../../../shared/archiveContracts'
import { approveSafeReviewGroup } from '../reviewQueueService'
import {
  listReviewConflictGroups,
  listReviewWorkbenchItems
} from '../reviewWorkbenchReadService'
import type { AgentAdapter } from './agentTypes'

type ReviewAgentDependencies = {
  listReviewWorkbenchItems?: typeof listReviewWorkbenchItems
  listReviewConflictGroups?: typeof listReviewConflictGroups
  approveSafeReviewGroup?: typeof approveSafeReviewGroup
}

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

export function createReviewAgentService(
  dependencies: ReviewAgentDependencies = {}
): AgentAdapter {
  const readWorkbenchItems = dependencies.listReviewWorkbenchItems ?? listReviewWorkbenchItems
  const readConflictGroups = dependencies.listReviewConflictGroups ?? listReviewConflictGroups
  const approveGroup = dependencies.approveSafeReviewGroup ?? approveSafeReviewGroup

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
        case 'review.apply_item_decision':
          throw new Error('review.apply_item_decision is not implemented yet')
      }

      throw new Error(`Unsupported review task kind: ${context.taskKind}`)
    }
  }
}
