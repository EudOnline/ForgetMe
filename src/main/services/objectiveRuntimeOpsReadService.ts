import type {
  ListObjectiveRuntimeAlertsInput,
  ObjectiveRuntimeAlertRecord,
  ObjectiveRuntimeEventRecord,
  ObjectiveRuntimeEventType,
  ObjectiveRuntimeProjectionHealthRecord,
  ObjectiveRuntimeReadModel,
  ObjectiveRuntimeScorecard,
  ListObjectiveRuntimeEventsInput
} from '../../shared/objectiveRuntimeContracts'
import type { ArchiveDatabase } from './db'
import { createObjectiveRuntimeAlertService } from './objectiveRuntimeAlertService'
import { createObjectiveRuntimeAuditService } from './objectiveRuntimeAuditService'
import { createObjectiveRuntimeProjectionHealthService } from './objectiveRuntimeProjectionHealthService'
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
  const runtimeAuditService = createObjectiveRuntimeAuditService({ db })
  const runtimeProjectionHealthService = createObjectiveRuntimeProjectionHealthService({
    db,
    runtimeTelemetry,
    runtimeAlertService,
    runtimeAuditService
  })

  function buildRuntimeScorecard(baseScorecard: ObjectiveRuntimeScorecard): ObjectiveRuntimeScorecard {
    const alertCounts = runtimeAlertService.readOpenAlertCounts()
    return {
      ...baseScorecard,
      warningAlertCount: alertCounts.warningAlertCount,
      criticalAlertCount: alertCounts.criticalAlertCount,
      runtimeAuditSummary: runtimeAuditService.readRuntimeAuditSummary()
    }
  }

  function getRuntimeScorecard(): ObjectiveRuntimeScorecard {
    const baseScorecard = runtimeTelemetry.getScorecard()
    runtimeAlertService.syncObjectiveRuntimeAlerts()
    runtimeAuditService.syncRuntimeAuditProjection()
    return buildRuntimeScorecard(baseScorecard)
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

  function getRuntimeProjectionHealth(): ObjectiveRuntimeProjectionHealthRecord[] {
    return runtimeProjectionHealthService.listRuntimeProjectionHealth()
  }

  function getRuntimeSnapshot(): ObjectiveRuntimeReadModel {
    runtimeAlertService.syncObjectiveRuntimeAlerts()
    runtimeAuditService.syncRuntimeAuditProjection()

    const baseScorecard = runtimeTelemetry.getScorecard()
    return {
      scorecard: buildRuntimeScorecard(baseScorecard),
      events: listRecentIncidents(),
      alerts: runtimeAlertService.readObjectiveRuntimeAlerts()
    }
  }

  return {
    getRuntimeScorecard,
    getRuntimeSnapshot,
    getRuntimeProjectionHealth,
    listRecentIncidents,
    listRuntimeAlerts
  }
}
