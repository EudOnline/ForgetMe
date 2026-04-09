import type {
  PersonAgentTaskRunRecord,
  PersonAgentTaskStatus
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { runPersonAgentRuntime } from './personAgentRuntimeService'
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
    operationKind: 'execute_task',
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
  return runPersonAgentRuntimeLoop(
    db,
    {
      canonicalPersonId: input.canonicalPersonId,
      personAgentId: input.personAgentId,
      limit: input.limit
    },
    (taskId): PersonAgentTaskRunRecord | null => {
      const result = runPersonAgentRuntime(db, {
        operationKind: 'execute_task',
        taskId,
        source: input.source ?? 'background_queue',
        now: input.now
      })

      return result.resultKind === 'task_run' ? result.taskRun : null
    }
  )
}
