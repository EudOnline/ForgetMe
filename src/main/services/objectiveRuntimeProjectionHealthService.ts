import type {
  ObjectiveRuntimeProjectionHealthRecord
} from '../../shared/objectiveRuntimeContracts'
import type { ArchiveDatabase } from './db'
import { createObjectiveRuntimeAlertService } from './objectiveRuntimeAlertService'
import { createObjectiveRuntimeAuditService } from './objectiveRuntimeAuditService'
import { createObjectiveRuntimeTelemetryService } from './objectiveRuntimeTelemetryService'

function buildProjectionHealth(input: {
  projectionKey: ObjectiveRuntimeProjectionHealthRecord['projectionKey']
  lastProjectedEventRowId: number
  currentEventRowId: number
  updatedAt: string | null
}): ObjectiveRuntimeProjectionHealthRecord {
  const lagEvents = Math.max(input.currentEventRowId - input.lastProjectedEventRowId, 0)

  return {
    projectionKey: input.projectionKey,
    lastProjectedEventRowId: input.lastProjectedEventRowId,
    currentEventRowId: input.currentEventRowId,
    lagEvents,
    isCurrent: lagEvents === 0,
    updatedAt: input.updatedAt
  }
}

export function createObjectiveRuntimeProjectionHealthService(dependencies: {
  db: ArchiveDatabase
  runtimeTelemetry?: ReturnType<typeof createObjectiveRuntimeTelemetryService>
  runtimeAlertService?: ReturnType<typeof createObjectiveRuntimeAlertService>
  runtimeAuditService?: ReturnType<typeof createObjectiveRuntimeAuditService>
}) {
  const runtimeTelemetry = dependencies.runtimeTelemetry ?? createObjectiveRuntimeTelemetryService({
    db: dependencies.db
  })
  const runtimeAlertService = dependencies.runtimeAlertService ?? createObjectiveRuntimeAlertService({
    db: dependencies.db,
    runtimeTelemetry
  })
  const runtimeAuditService = dependencies.runtimeAuditService ?? createObjectiveRuntimeAuditService({
    db: dependencies.db
  })

  function listRuntimeProjectionHealth(): ObjectiveRuntimeProjectionHealthRecord[] {
    const alertProjection = runtimeAlertService.readAlertProjectionState()
    const auditProjection = runtimeAuditService.readAuditProjectionState()
    const scorecardProjection = runtimeTelemetry.readScorecardProjectionState()

    return [
      buildProjectionHealth(alertProjection),
      buildProjectionHealth(auditProjection),
      buildProjectionHealth(scorecardProjection)
    ]
  }

  return {
    listRuntimeProjectionHealth
  }
}
