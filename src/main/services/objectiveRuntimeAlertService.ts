import crypto from 'node:crypto'
import type {
  AcknowledgeObjectiveRuntimeAlertInput,
  ListObjectiveRuntimeAlertsInput,
  ObjectiveRuntimeAlertRecord,
  ObjectiveRuntimeAlertSeverity,
  ObjectiveRuntimeAlertStatus,
  ObjectiveRuntimeEventRecord,
  ObjectiveRuntimeEventType,
  ResolveObjectiveRuntimeAlertInput
} from '../../shared/objectiveRuntimeContracts'
import type { ArchiveDatabase } from './db'
import { createObjectiveRuntimeTelemetryService } from './objectiveRuntimeTelemetryService'

type AlertRow = {
  alertId: string
  fingerprint: string
  severity: ObjectiveRuntimeAlertSeverity
  status: ObjectiveRuntimeAlertStatus
  objectiveId: string
  proposalId: string | null
  firstEventId: string
  latestEventId: string
  eventCount: number
  title: string
  detail: string | null
  openedAt: string
  lastSeenAt: string
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  resolvedAt: string | null
}

const ALERTABLE_EVENT_TYPES = new Set<ObjectiveRuntimeEventType>([
  'proposal_blocked',
  'proposal_vetoed',
  'objective_stalled',
  'subagent_budget_exhausted',
  'tool_timeout'
])

function nowIso() {
  return new Date().toISOString()
}

function buildFingerprint(event: ObjectiveRuntimeEventRecord) {
  switch (event.eventType) {
    case 'proposal_blocked':
    case 'proposal_vetoed':
    case 'subagent_budget_exhausted':
    case 'tool_timeout':
      return `${event.eventType}:${event.proposalId ?? event.objectiveId}`
    case 'objective_stalled':
    default:
      return `${event.eventType}:${event.objectiveId}`
  }
}

function classifySeverity(input: {
  eventType: ObjectiveRuntimeEventType
  eventCount: number
}): ObjectiveRuntimeAlertSeverity {
  if (input.eventCount >= 2) {
    return 'critical'
  }

  return input.eventType === 'proposal_vetoed'
    ? 'critical'
    : 'warning'
}

function buildAlertTitle(input: {
  eventType: ObjectiveRuntimeEventType
  eventCount: number
}) {
  const repeated = input.eventCount >= 2

  switch (input.eventType) {
    case 'objective_stalled':
      return repeated ? 'Repeated stalled objective' : 'Stalled objective'
    case 'proposal_blocked':
      return repeated ? 'Repeated blocked proposal' : 'Blocked proposal'
    case 'proposal_vetoed':
      return repeated ? 'Repeated vetoed proposal' : 'Vetoed proposal'
    case 'subagent_budget_exhausted':
      return repeated ? 'Repeated exhausted budgets' : 'Exhausted budget'
    case 'tool_timeout':
      return repeated ? 'Repeated tool timeouts' : 'Tool timeout'
    default:
      return 'Runtime alert'
  }
}

function buildAlertDetail(event: ObjectiveRuntimeEventRecord) {
  const payload = event.payload

  if (typeof payload.blocker === 'string' && payload.blocker.length > 0) {
    return payload.blocker
  }

  if (typeof payload.toolName === 'string' && payload.toolName.length > 0) {
    return `Tool ${payload.toolName} exceeded its bounded runtime budget.`
  }

  if (typeof payload.specialization === 'string' && payload.specialization.length > 0) {
    return `${payload.specialization} exhausted its bounded execution budget.`
  }

  if (typeof payload.roundCount === 'number') {
    return `The objective stalled after ${payload.roundCount} rounds without enough progress.`
  }

  return null
}

function mapAlertRow(row: AlertRow): ObjectiveRuntimeAlertRecord {
  return {
    alertId: row.alertId,
    fingerprint: row.fingerprint,
    severity: row.severity,
    status: row.status,
    objectiveId: row.objectiveId,
    proposalId: row.proposalId,
    firstEventId: row.firstEventId,
    latestEventId: row.latestEventId,
    eventCount: row.eventCount,
    title: row.title,
    detail: row.detail,
    openedAt: row.openedAt,
    lastSeenAt: row.lastSeenAt,
    acknowledgedAt: row.acknowledgedAt,
    acknowledgedBy: row.acknowledgedBy,
    resolvedAt: row.resolvedAt
  }
}

export function createObjectiveRuntimeAlertService(dependencies: {
  db: ArchiveDatabase
  runtimeTelemetry?: ReturnType<typeof createObjectiveRuntimeTelemetryService>
}) {
  const { db } = dependencies
  const runtimeTelemetry = dependencies.runtimeTelemetry ?? createObjectiveRuntimeTelemetryService({ db })

  function getAlertById(alertId: string) {
    const row = db.prepare(
      `select
        id as alertId,
        fingerprint,
        severity,
        status,
        objective_id as objectiveId,
        proposal_id as proposalId,
        first_event_id as firstEventId,
        latest_event_id as latestEventId,
        event_count as eventCount,
        title,
        detail,
        opened_at as openedAt,
        last_seen_at as lastSeenAt,
        acknowledged_at as acknowledgedAt,
        acknowledged_by as acknowledgedBy,
        resolved_at as resolvedAt
      from agent_runtime_alerts
      where id = ?`
    ).get(alertId) as AlertRow | undefined

    return row ? mapAlertRow(row) : null
  }

  function syncObjectiveRuntimeAlerts() {
    const events = runtimeTelemetry.listEvents()
      .filter((event) => ALERTABLE_EVENT_TYPES.has(event.eventType))

    const groupedEvents = new Map<string, ObjectiveRuntimeEventRecord[]>()
    for (const event of events) {
      const fingerprint = buildFingerprint(event)
      const group = groupedEvents.get(fingerprint) ?? []
      group.push(event)
      groupedEvents.set(fingerprint, group)
    }

    const selectExistingAlert = db.prepare(
      `select
        id as alertId,
        fingerprint,
        severity,
        status,
        objective_id as objectiveId,
        proposal_id as proposalId,
        first_event_id as firstEventId,
        latest_event_id as latestEventId,
        event_count as eventCount,
        title,
        detail,
        opened_at as openedAt,
        last_seen_at as lastSeenAt,
        acknowledged_at as acknowledgedAt,
        acknowledged_by as acknowledgedBy,
        resolved_at as resolvedAt
      from agent_runtime_alerts
      where fingerprint = ?`
    )

    const upsertAlert = db.prepare(
      `insert into agent_runtime_alerts (
        id,
        fingerprint,
        severity,
        status,
        objective_id,
        proposal_id,
        first_event_id,
        latest_event_id,
        event_count,
        title,
        detail,
        opened_at,
        last_seen_at,
        acknowledged_at,
        acknowledged_by,
        resolved_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(fingerprint) do update set
        severity = excluded.severity,
        status = excluded.status,
        objective_id = excluded.objective_id,
        proposal_id = excluded.proposal_id,
        first_event_id = excluded.first_event_id,
        latest_event_id = excluded.latest_event_id,
        event_count = excluded.event_count,
        title = excluded.title,
        detail = excluded.detail,
        opened_at = excluded.opened_at,
        last_seen_at = excluded.last_seen_at,
        acknowledged_at = excluded.acknowledged_at,
        acknowledged_by = excluded.acknowledged_by,
        resolved_at = excluded.resolved_at`
    )

    for (const [fingerprint, group] of groupedEvents.entries()) {
      const firstEvent = group[0]
      const latestEvent = group.at(-1) ?? firstEvent
      const existing = selectExistingAlert.get(fingerprint) as AlertRow | undefined
      const severity = classifySeverity({
        eventType: latestEvent.eventType,
        eventCount: group.length
      })
      const nextStatus = existing?.status === 'resolved' && existing.latestEventId !== latestEvent.eventId
        ? 'open'
        : existing?.status ?? 'open'
      const acknowledgedAt = nextStatus === 'open'
        ? null
        : existing?.acknowledgedAt ?? null
      const acknowledgedBy = nextStatus === 'open'
        ? null
        : existing?.acknowledgedBy ?? null
      const resolvedAt = nextStatus === 'resolved'
        ? existing?.resolvedAt ?? null
        : null

      upsertAlert.run(
        existing?.alertId ?? crypto.randomUUID(),
        fingerprint,
        severity,
        nextStatus,
        latestEvent.objectiveId,
        latestEvent.proposalId,
        firstEvent.eventId,
        latestEvent.eventId,
        group.length,
        buildAlertTitle({
          eventType: latestEvent.eventType,
          eventCount: group.length
        }),
        buildAlertDetail(latestEvent),
        existing?.openedAt ?? firstEvent.createdAt,
        latestEvent.createdAt,
        acknowledgedAt,
        acknowledgedBy,
        resolvedAt
      )
    }
  }

  function listObjectiveRuntimeAlerts(input: ListObjectiveRuntimeAlertsInput = {}) {
    syncObjectiveRuntimeAlerts()

    return db.prepare(
      `select
        id as alertId,
        fingerprint,
        severity,
        status,
        objective_id as objectiveId,
        proposal_id as proposalId,
        first_event_id as firstEventId,
        latest_event_id as latestEventId,
        event_count as eventCount,
        title,
        detail,
        opened_at as openedAt,
        last_seen_at as lastSeenAt,
        acknowledged_at as acknowledgedAt,
        acknowledged_by as acknowledgedBy,
        resolved_at as resolvedAt
      from agent_runtime_alerts
      where (? is null or objective_id = ?)
        and (? is null or proposal_id = ?)
        and (? is null or status = ?)
      order by
        case severity when 'critical' then 0 else 1 end,
        last_seen_at desc,
        rowid desc
      limit ?`
    ).all(
      input.objectiveId ?? null,
      input.objectiveId ?? null,
      input.proposalId ?? null,
      input.proposalId ?? null,
      input.status ?? null,
      input.status ?? null,
      input.limit ?? 50
    ).map((row) => mapAlertRow(row as AlertRow))
  }

  function acknowledgeObjectiveRuntimeAlert(input: AcknowledgeObjectiveRuntimeAlertInput) {
    db.prepare(
      `update agent_runtime_alerts
      set
        status = 'acknowledged',
        acknowledged_at = ?,
        acknowledged_by = ?
      where id = ?
        and status != 'resolved'`
    ).run(
      nowIso(),
      input.actor ?? 'operator',
      input.alertId
    )

    return getAlertById(input.alertId)
  }

  function resolveObjectiveRuntimeAlert(input: ResolveObjectiveRuntimeAlertInput) {
    db.prepare(
      `update agent_runtime_alerts
      set
        status = 'resolved',
        resolved_at = ?
      where id = ?`
    ).run(
      nowIso(),
      input.alertId
    )

    return getAlertById(input.alertId)
  }

  return {
    listObjectiveRuntimeAlerts,
    acknowledgeObjectiveRuntimeAlert,
    resolveObjectiveRuntimeAlert,
    syncObjectiveRuntimeAlerts
  }
}
