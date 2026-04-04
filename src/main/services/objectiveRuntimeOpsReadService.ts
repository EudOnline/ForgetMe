import type {
  ListObjectiveRuntimeAlertsInput,
  ObjectiveRuntimeAlertRecord,
  ObjectiveRuntimeEventRecord,
  ObjectiveRuntimeEventType,
  ObjectiveRuntimeScorecard,
  ListObjectiveRuntimeEventsInput
} from '../../shared/objectiveRuntimeContracts'
import type { ArchiveDatabase } from './db'
import { createObjectiveRuntimeAlertService } from './objectiveRuntimeAlertService'
import { createObjectiveRuntimeTelemetryService } from './objectiveRuntimeTelemetryService'

const INCIDENT_EVENT_TYPES = new Set<ObjectiveRuntimeEventType>([
  'proposal_awaiting_operator',
  'proposal_blocked',
  'proposal_vetoed',
  'objective_stalled',
  'subagent_budget_exhausted',
  'tool_timeout',
  'recovery_attempted',
  'recovery_exhausted',
  'objective_recovered'
])

export function createObjectiveRuntimeOpsReadService(dependencies: {
  db: ArchiveDatabase
  runtimeTelemetry?: ReturnType<typeof createObjectiveRuntimeTelemetryService>
  runtimeAlertService?: ReturnType<typeof createObjectiveRuntimeAlertService>
}) {
  const { db } = dependencies
  const runtimeTelemetry = dependencies.runtimeTelemetry ?? createObjectiveRuntimeTelemetryService({ db })
  const runtimeAlertService = dependencies.runtimeAlertService ?? createObjectiveRuntimeAlertService({
    db,
    runtimeTelemetry
  })

  function getRuntimeScorecard(): ObjectiveRuntimeScorecard {
    const baseScorecard = runtimeTelemetry.getScorecard()
    const alerts = runtimeAlertService.listObjectiveRuntimeAlerts({
      limit: 200
    })

    return {
      ...baseScorecard,
      warningAlertCount: alerts.filter((alert) => (
        alert.severity === 'warning' && alert.status !== 'resolved'
      )).length,
      criticalAlertCount: alerts.filter((alert) => (
        alert.severity === 'critical' && alert.status !== 'resolved'
      )).length
    }
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

  function listRuntimeAlerts(input?: ListObjectiveRuntimeAlertsInput): ObjectiveRuntimeAlertRecord[] {
    return runtimeAlertService.listObjectiveRuntimeAlerts(input)
  }

  return {
    getRuntimeScorecard,
    listRecentIncidents,
    listRuntimeAlerts
  }
}
