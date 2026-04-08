import type { PersonAgentTaskRecord } from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  getPersonAgentByCanonicalPersonId,
  listPersonAgentAuditEvents,
  listPersonAgentInteractionMemories,
  listPersonAgentRefreshQueue,
  replacePersonAgentTasks
} from './governancePersistenceService'
import { getPersonAgentFactMemorySummary } from './personAgentFactMemoryService'

function sortTasks(tasks: Array<Omit<PersonAgentTaskRecord, 'taskId' | 'personAgentId' | 'canonicalPersonId' | 'createdAt' | 'updatedAt'>>) {
  return [...tasks].sort((left, right) => {
    const leftPriority = left.priority === 'high' ? 0 : 1
    const rightPriority = right.priority === 'high' ? 0 : 1
    return leftPriority - rightPriority || left.taskKind.localeCompare(right.taskKind)
  })
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

  const tasks = [] as Array<Omit<PersonAgentTaskRecord, 'taskId' | 'personAgentId' | 'canonicalPersonId' | 'createdAt' | 'updatedAt'>>
  const pendingRefresh = refreshQueue.find((row) => row.status === 'pending') ?? null
  if (pendingRefresh) {
    tasks.push({
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
