import type { PersonAgentTaskRunRecord } from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { listPersonAgentTasks } from './governancePersistenceService'
import { isAutoExecutablePersonAgentTask } from './personAgentTaskStateService'

export function runPersonAgentRuntimeLoop(
  db: ArchiveDatabase,
  input: {
    canonicalPersonId?: string
    personAgentId?: string
    limit?: number
  },
  executeTask: (taskId: string) => PersonAgentTaskRunRecord | null
) {
  const executableTasks = listPersonAgentTasks(db, {
    canonicalPersonId: input.canonicalPersonId,
    personAgentId: input.personAgentId,
    status: 'pending'
  }).filter(isAutoExecutablePersonAgentTask)

  const limitedTasks = input.limit && input.limit > 0
    ? executableTasks.slice(0, input.limit)
    : executableTasks

  const runs: PersonAgentTaskRunRecord[] = []
  for (const task of limitedTasks) {
    const run = executeTask(task.taskId)

    if (run) {
      runs.push(run)
    }
  }

  return runs
}
