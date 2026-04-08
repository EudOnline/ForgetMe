import type {
  PersonAgentTaskRecord,
  PersonAgentTaskStatus
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  appendPersonAgentAuditEvent,
  getPersonAgentByCanonicalPersonId,
  getPersonAgentTaskById,
  listPersonAgentAuditEvents,
  listPersonAgentInteractionMemories,
  listPersonAgentRefreshQueue,
  replacePersonAgentTasks,
  updatePersonAgentTaskStatus
} from './governancePersistenceService'
import { getPersonAgentFactMemorySummary } from './personAgentFactMemoryService'

type DerivedTaskRow = Omit<
  PersonAgentTaskRecord,
  | 'taskId'
  | 'personAgentId'
  | 'canonicalPersonId'
  | 'statusChangedAt'
  | 'statusSource'
  | 'statusReason'
  | 'createdAt'
  | 'updatedAt'
>

function sortTasks(tasks: DerivedTaskRow[]) {
  return [...tasks].sort((left, right) => {
    const leftPriority = left.priority === 'high' ? 0 : 1
    const rightPriority = right.priority === 'high' ? 0 : 1
    return leftPriority - rightPriority || left.taskKind.localeCompare(right.taskKind)
  })
}

function buildTaskKey(parts: string[]) {
  return parts.join(':')
}

function canTransitionTaskStatus(currentStatus: PersonAgentTaskStatus, nextStatus: PersonAgentTaskStatus) {
  if (currentStatus === nextStatus) {
    return true
  }

  if (currentStatus === 'pending') {
    return nextStatus === 'processing' || nextStatus === 'completed' || nextStatus === 'dismissed'
  }

  if (currentStatus === 'processing') {
    return nextStatus === 'completed' || nextStatus === 'dismissed'
  }

  return false
}

export function syncPersonAgentTasks(db: ArchiveDatabase, input: {
  canonicalPersonId: string
  now?: string
}) {
  const personAgent = getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })

  if (!personAgent || personAgent.status !== 'active') {
    return [] as PersonAgentTaskRecord[]
  }

  const factSummary = getPersonAgentFactMemorySummary(db, {
    canonicalPersonId: input.canonicalPersonId
  })
  const interactionMemories = listPersonAgentInteractionMemories(db, {
    canonicalPersonId: input.canonicalPersonId
  })
  const refreshQueue = listPersonAgentRefreshQueue(db, {
    canonicalPersonId: input.canonicalPersonId
  })
  const auditEvents = listPersonAgentAuditEvents(db, {
    canonicalPersonId: input.canonicalPersonId
  })

  const tasks = [] as DerivedTaskRow[]
  const pendingRefresh = refreshQueue.find((row) => row.status === 'pending') ?? null
  if (pendingRefresh) {
    tasks.push({
      taskKey: buildTaskKey(['await_refresh', pendingRefresh.refreshId]),
      taskKind: 'await_refresh',
      status: 'pending',
      priority: 'high',
      title: 'Await queued refresh',
      summary: pendingRefresh.reasons.length > 0
        ? `Wait for refresh to finish before acting on: ${pendingRefresh.reasons.join(', ')}.`
        : 'Wait for the pending refresh to finish.',
      sourceRef: {
        refreshId: pendingRefresh.refreshId,
        reasons: pendingRefresh.reasons
      }
    })
  }

  const firstConflict = factSummary?.conflicts[0] ?? null
  if (firstConflict) {
    tasks.push({
      taskKey: buildTaskKey(['resolve_conflict', firstConflict.memoryKey, firstConflict.sourceHash]),
      taskKind: 'resolve_conflict',
      status: 'pending',
      priority: 'high',
      title: `Resolve ${firstConflict.displayLabel}`,
      summary: firstConflict.summaryValue,
      sourceRef: {
        memoryKey: firstConflict.memoryKey
      }
    })
  }

  const firstGap = factSummary?.coverageGaps[0] ?? null
  if (firstGap) {
    tasks.push({
      taskKey: buildTaskKey(['fill_coverage_gap', firstGap.memoryKey, firstGap.sourceHash]),
      taskKind: 'fill_coverage_gap',
      status: 'pending',
      priority: 'medium',
      title: `Fill ${firstGap.displayLabel}`,
      summary: firstGap.summaryValue,
      sourceRef: {
        memoryKey: firstGap.memoryKey
      }
    })
  }

  const hotspot = [...interactionMemories]
    .filter((record) => record.questionCount >= 2)
    .sort((left, right) => right.questionCount - left.questionCount || left.memoryKey.localeCompare(right.memoryKey))[0] ?? null
  if (hotspot) {
    tasks.push({
      taskKey: buildTaskKey([
        'expand_topic',
        hotspot.memoryKey,
        String(hotspot.questionCount),
        String(hotspot.citationCount)
      ]),
      taskKind: 'expand_topic',
      status: 'pending',
      priority: 'medium',
      title: `Expand ${hotspot.topicLabel}`,
      summary: hotspot.summary,
      sourceRef: {
        memoryKey: hotspot.memoryKey,
        questionCount: hotspot.questionCount
      }
    })
  }

  const latestStrategyChange = auditEvents.find((event) => event.eventKind === 'strategy_profile_updated') ?? null
  if (latestStrategyChange) {
    tasks.push({
      taskKey: buildTaskKey(['review_strategy_change', latestStrategyChange.auditEventId]),
      taskKind: 'review_strategy_change',
      status: 'pending',
      priority: 'medium',
      title: 'Review strategy change',
      summary: 'Recent strategy profile changes may require follow-up consultation guidance.',
      sourceRef: {
        auditEventId: latestStrategyChange.auditEventId
      }
    })
  }

  return replacePersonAgentTasks(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    rows: sortTasks(tasks),
    now: input.now
  })
}

export function transitionPersonAgentTask(db: ArchiveDatabase, input: {
  taskId: string
  status: Exclude<PersonAgentTaskStatus, 'pending'>
  source?: string
  reason?: string
  now?: string
}) {
  const existing = getPersonAgentTaskById(db, {
    taskId: input.taskId
  })

  if (!existing) {
    return null
  }

  if (!canTransitionTaskStatus(existing.status, input.status)) {
    throw new Error(`Unsupported person-agent task transition: ${existing.status} -> ${input.status}`)
  }

  const now = input.now ?? new Date().toISOString()
  const updatedTask = updatePersonAgentTaskStatus(db, {
    taskId: input.taskId,
    status: input.status,
    statusChangedAt: now,
    statusSource: input.source ?? null,
    statusReason: input.reason ?? null,
    updatedAt: now
  })

  if (!updatedTask) {
    return null
  }

  appendPersonAgentAuditEvent(db, {
    personAgentId: updatedTask.personAgentId,
    canonicalPersonId: updatedTask.canonicalPersonId,
    eventKind: 'task_status_updated',
    payload: {
      taskId: updatedTask.taskId,
      taskKey: updatedTask.taskKey,
      taskKind: updatedTask.taskKind,
      previousStatus: existing.status,
      nextStatus: updatedTask.status,
      source: input.source ?? null,
      reason: input.reason ?? null
    },
    createdAt: now
  })

  return updatedTask
}
