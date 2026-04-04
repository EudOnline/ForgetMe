import type {
  ObjectiveRuntimeEventRecord,
  ObjectiveRuntimeEventType,
  ObjectiveRuntimeScorecard,
  ListObjectiveRuntimeEventsInput
} from '../../shared/objectiveRuntimeContracts'
import type { ArchiveDatabase } from './db'
import { createObjectiveRuntimeTelemetryService } from './objectiveRuntimeTelemetryService'

const INCIDENT_EVENT_TYPES = new Set<ObjectiveRuntimeEventType>([
  'proposal_awaiting_operator',
  'proposal_blocked',
  'proposal_vetoed',
  'objective_stalled'
])

export function createObjectiveRuntimeOpsReadService(dependencies: {
  db: ArchiveDatabase
  runtimeTelemetry?: ReturnType<typeof createObjectiveRuntimeTelemetryService>
}) {
  const { db } = dependencies
  const runtimeTelemetry = dependencies.runtimeTelemetry ?? createObjectiveRuntimeTelemetryService({ db })

  function getRuntimeScorecard(): ObjectiveRuntimeScorecard {
    return runtimeTelemetry.getScorecard()
  }

  function listRecentIncidents(input?: ListObjectiveRuntimeEventsInput): ObjectiveRuntimeEventRecord[] {
    const events = runtimeTelemetry.listEvents({
      objectiveId: input?.objectiveId,
      proposalId: input?.proposalId
    })

    return events
      .filter((event) => INCIDENT_EVENT_TYPES.has(event.eventType))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, input?.limit ?? 50)
  }

  return {
    getRuntimeScorecard,
    listRecentIncidents
  }
}
