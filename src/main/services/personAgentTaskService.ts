import type {
  PersonAgentTaskRecord,
  PersonAgentTaskRunRecord,
  PersonAgentTaskStatus
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  appendPersonAgentTaskRun,
  appendPersonAgentAuditEvent,
  getPersonAgentByCanonicalPersonId,
  getPersonAgentCapsule,
  getPersonAgentTaskById,
  listPersonAgentAuditEvents,
  listPersonAgentInteractionMemories,
  listPersonAgentRefreshQueue,
  listPersonAgentTasks,
  replacePersonAgentTasks,
  updatePersonAgentTaskStatus
} from './governancePersistenceService'
import { getPersonAgentFactMemorySummary } from './personAgentFactMemoryService'
import {
  appendPersonAgentCapsuleActivityEvent,
  syncPersonAgentCapsuleRuntimeArtifacts
} from './personAgentCapsuleRuntimeArtifactsService'

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

function conflictQuestion() {
  return '这条冲突信息里，哪一个来源更可信？'
}

function coverageGapQuestion() {
  return '关于这个人，还有哪一类资料最值得补充？'
}

function strategyQuestion() {
  return '这次策略调整是否需要同步到前端展示方式？'
}

function isAutoExecutableTask(task: PersonAgentTaskRecord) {
  return task.taskKind !== 'await_refresh'
}

function buildTaskExecutionRun(_db: ArchiveDatabase, task: PersonAgentTaskRecord): Omit<
  PersonAgentTaskRunRecord,
  'runId' | 'createdAt' | 'updatedAt'
> {
  if (task.taskKind === 'await_refresh') {
    return {
      taskId: task.taskId,
      taskKey: task.taskKey,
      personAgentId: task.personAgentId,
      canonicalPersonId: task.canonicalPersonId,
      taskKind: task.taskKind,
      runStatus: 'blocked',
      summary: 'Refresh is still pending, so downstream conflict review should wait.',
      suggestedQuestion: null,
      actionItems: [{
        kind: 'wait_for_refresh',
        label: 'Wait for queued refresh',
        payload: {
          refreshId: task.sourceRef.refreshId ?? null
        }
      }],
      source: null
    }
  }

  if (task.taskKind === 'resolve_conflict') {
    return {
      taskId: task.taskId,
      taskKey: task.taskKey,
      personAgentId: task.personAgentId,
      canonicalPersonId: task.canonicalPersonId,
      taskKind: task.taskKind,
      runStatus: 'completed',
      summary: 'Review the conflicting evidence for school_name before answering with a single value.',
      suggestedQuestion: conflictQuestion(),
      actionItems: [{
        kind: 'review_conflict',
        label: 'Review conflicting memory',
        payload: {
          memoryKey: task.sourceRef.memoryKey ?? null
        }
      }],
      source: null
    }
  }

  if (task.taskKind === 'fill_coverage_gap') {
    return {
      taskId: task.taskId,
      taskKey: task.taskKey,
      personAgentId: task.personAgentId,
      canonicalPersonId: task.canonicalPersonId,
      taskKind: task.taskKind,
      runStatus: 'completed',
      summary: `Collect more grounded evidence for ${task.title.replace(/^Fill /, '')} before future consultations rely on it.`,
      suggestedQuestion: coverageGapQuestion(),
      actionItems: [{
        kind: 'collect_evidence',
        label: 'Collect supporting evidence',
        payload: {
          memoryKey: task.sourceRef.memoryKey ?? null
        }
      }],
      source: null
    }
  }

  if (task.taskKind === 'expand_topic') {
    const topicLabel = task.title.replace(/^Expand /, '')
    const suggestedQuestion = `要不要继续追问 ${topicLabel} 的细节？`

    return {
      taskId: task.taskId,
      taskKey: task.taskKey,
      personAgentId: task.personAgentId,
      canonicalPersonId: task.canonicalPersonId,
      taskKind: task.taskKind,
      runStatus: 'completed',
      summary: `Prepare a follow-up question for the recurring topic ${topicLabel}.`,
      suggestedQuestion,
      actionItems: [{
        kind: 'ask_follow_up',
        label: 'Ask suggested follow-up',
        payload: {
          question: suggestedQuestion
        }
      }],
      source: null
    }
  }

  return {
    taskId: task.taskId,
    taskKey: task.taskKey,
    personAgentId: task.personAgentId,
    canonicalPersonId: task.canonicalPersonId,
    taskKind: task.taskKind,
    runStatus: 'completed',
    summary: 'Review the latest strategy adjustment before aligning downstream consultation behavior.',
    suggestedQuestion: strategyQuestion(),
    actionItems: [{
      kind: 'review_strategy',
      label: 'Review strategy change',
      payload: {
        auditEventId: task.sourceRef.auditEventId ?? null
      }
    }],
    source: null
  }
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

export function executePersonAgentTask(db: ArchiveDatabase, input: {
  taskId: string
  source?: string
  now?: string
}) {
  const task = getPersonAgentTaskById(db, {
    taskId: input.taskId
  })

  if (!task) {
    return null
  }

  if (task.status === 'completed' || task.status === 'dismissed') {
    throw new Error(`Cannot execute terminal person-agent task: ${task.taskId}`)
  }

  const now = input.now ?? new Date().toISOString()
  const runDraft = buildTaskExecutionRun(db, task)
  const run = appendPersonAgentTaskRun(db, {
    ...runDraft,
    source: input.source ?? null,
    createdAt: now,
    updatedAt: now
  })

  if (!run) {
    return null
  }

  if (run.runStatus === 'completed') {
    transitionPersonAgentTask(db, {
      taskId: task.taskId,
      status: 'completed',
      source: input.source ?? 'task_executor',
      reason: `task_run:${run.runId}`,
      now
    })
  }

  const capsule = getPersonAgentCapsule(db, {
    personAgentId: task.personAgentId,
    canonicalPersonId: task.canonicalPersonId
  })

  appendPersonAgentAuditEvent(db, {
    personAgentId: task.personAgentId,
    canonicalPersonId: task.canonicalPersonId,
    eventKind: 'task_executed',
    payload: {
      runId: run.runId,
      taskId: task.taskId,
      taskKey: task.taskKey,
      taskKind: task.taskKind,
      runStatus: run.runStatus,
      source: input.source ?? null,
      capsuleId: capsule?.capsuleId ?? null,
      capsuleSessionNamespace: capsule?.sessionNamespace ?? null
    },
    createdAt: now
  })

  const personAgent = getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: task.canonicalPersonId
  })
  if (capsule && personAgent) {
    syncPersonAgentCapsuleRuntimeArtifacts(db, {
      capsule,
      personAgent,
      now
    })
    appendPersonAgentCapsuleActivityEvent({
      capsule,
      event: {
        eventKind: 'task_run_recorded',
        capsuleId: capsule.capsuleId,
        personAgentId: task.personAgentId,
        canonicalPersonId: task.canonicalPersonId,
        runId: run.runId,
        taskId: task.taskId,
        taskKind: task.taskKind,
        runStatus: run.runStatus,
        source: input.source ?? null,
        createdAt: now
      }
    })
  }

  return run
}

export function processPersonAgentTaskQueue(db: ArchiveDatabase, input: {
  canonicalPersonId?: string
  personAgentId?: string
  limit?: number
  source?: string
  now?: string
} = {}) {
  const executableTasks = listPersonAgentTasks(db, {
    canonicalPersonId: input.canonicalPersonId,
    personAgentId: input.personAgentId,
    status: 'pending'
  }).filter(isAutoExecutableTask)

  const limitedTasks = input.limit && input.limit > 0
    ? executableTasks.slice(0, input.limit)
    : executableTasks

  const runs: PersonAgentTaskRunRecord[] = []
  for (const task of limitedTasks) {
    const run = executePersonAgentTask(db, {
      taskId: task.taskId,
      source: input.source ?? 'background_queue',
      now: input.now
    })

    if (run) {
      runs.push(run)
    }
  }

  return runs
}
