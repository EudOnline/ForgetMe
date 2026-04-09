import type {
  PersonAgentTaskRunRecord,
  PersonAgentTaskStatus
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  processPersonAgentRuntimeLoop,
  runPersonAgentRuntime
} from './personAgentRuntimeService'
import { runPersonAgentRuntimeLoop } from './personAgentRuntimeLoopService'
import {
  syncPersonAgentTasks as syncPersonAgentTaskState,
  transitionPersonAgentTaskState
} from './personAgentTaskStateService'

export function syncPersonAgentTasks(db: ArchiveDatabase, input: {
  canonicalPersonId: string
  now?: string
}) {
  return syncPersonAgentTaskState(db, input)
}

export function transitionPersonAgentTask(db: ArchiveDatabase, input: {
  taskId: string
  status: Exclude<PersonAgentTaskStatus, 'pending'>
  source?: string
  reason?: string
  now?: string
}) {
  return transitionPersonAgentTaskState(db, input)
}

export function executePersonAgentTask(db: ArchiveDatabase, input: {
  taskId: string
  source?: string
  now?: string
}) {
  const result = runPersonAgentRuntime(db, {
    operationKind: 'task_run',
    taskId: input.taskId,
    source: input.source,
    now: input.now
  })

  return result.resultKind === 'task_run' ? result.taskRun : null
}

export function processPersonAgentTaskQueue(db: ArchiveDatabase, input: {
  canonicalPersonId?: string
  personAgentId?: string
  limit?: number
  source?: string
  now?: string
} = {}) {
  return processPersonAgentRuntimeLoop(db, {
    canonicalPersonId: input.canonicalPersonId,
    personAgentId: input.personAgentId,
    limit: input.limit,
    source: input.source ?? 'background_queue',
    now: input.now
  })
}
