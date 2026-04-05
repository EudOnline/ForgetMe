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
  firstEventRowId: number
  latestEventRowId: number
  openedAt: string
  lastSeenAt: string
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  resolvedAt: string | null
  reopenedCount: number
}

type AlertableEventRow = {
  eventRowId: number
  eventId: string
  objectiveId: string
  threadId: string | null
  proposalId: string | null
  eventType: ObjectiveRuntimeEventType
  payloadJson: string
  createdAt: string
}

type AlertProjectionState = {
  projectionKey: 'runtime_alerts'
  lastProjectedEventRowId: number
  currentEventRowId: number
  updatedAt: string | null
}

const ALERTABLE_EVENT_TYPES = new Set<ObjectiveRuntimeEventType>([
  'proposal_blocked',
  'proposal_vetoed',
  'objective_stalled',
  'subagent_budget_exhausted',
  'tool_timeout'
])
const ALERTABLE_EVENT_TYPE_LIST = [...ALERTABLE_EVENT_TYPES]
const ALERT_PROJECTION_KEY = 'runtime_alerts'

function nowIso() {
  return new Date().toISOString()
}

function parseJson(value: string) {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object'
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
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
  const alertableEventPlaceholders = ALERTABLE_EVENT_TYPE_LIST.map(() => '?').join(', ')

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
        first_event_rowid as firstEventRowId,
        latest_event_rowid as latestEventRowId,
        opened_at as openedAt,
        last_seen_at as lastSeenAt,
        acknowledged_at as acknowledgedAt,
        acknowledged_by as acknowledgedBy,
        resolved_at as resolvedAt,
        reopened_count as reopenedCount
      from agent_runtime_alerts
      where id = ?`
    ).get(alertId) as AlertRow | undefined

    return row ? mapAlertRow(row) : null
  }

  function getProjectionBaselineLastEventRowId() {
    const alertRowCount = db.prepare(
      'select count(*) as count from agent_runtime_alerts'
    ).get() as { count: number }

    if (alertRowCount.count === 0) {
      return 0
    }

    const row = db.prepare(
      `select coalesce(max(rowid), 0) as lastEventRowId
      from agent_runtime_events
      where event_type in (${alertableEventPlaceholders})`
    ).get(...ALERTABLE_EVENT_TYPE_LIST) as { lastEventRowId: number }

    return row.lastEventRowId
  }

  function getOrCreateProjectionState() {
    const existing = db.prepare(
      `select last_event_rowid as lastEventRowId
      from agent_runtime_alert_projection_state
      where projection_key = ?`
    ).get(ALERT_PROJECTION_KEY) as { lastEventRowId: number } | undefined

    if (existing) {
      return existing.lastEventRowId
    }

    const baselineLastEventRowId = getProjectionBaselineLastEventRowId()
    db.prepare(
      `insert into agent_runtime_alert_projection_state (
        projection_key,
        last_event_rowid,
        updated_at
      ) values (?, ?, ?)`
    ).run(
      ALERT_PROJECTION_KEY,
      baselineLastEventRowId,
      nowIso()
    )

    return baselineLastEventRowId
  }

  function getCurrentAlertableEventRowId() {
    const row = db.prepare(
      `select coalesce(max(rowid), 0) as lastEventRowId
      from agent_runtime_events
      where event_type in (${alertableEventPlaceholders})`
    ).get(...ALERTABLE_EVENT_TYPE_LIST) as { lastEventRowId: number }

    return row.lastEventRowId
  }

  function syncObjectiveRuntimeAlerts() {
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
        first_event_rowid as firstEventRowId,
        latest_event_rowid as latestEventRowId,
        opened_at as openedAt,
        last_seen_at as lastSeenAt,
        acknowledged_at as acknowledgedAt,
        acknowledged_by as acknowledgedBy,
        resolved_at as resolvedAt,
        reopened_count as reopenedCount
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
        first_event_rowid,
        latest_event_rowid,
        opened_at,
        last_seen_at,
        acknowledged_at,
        acknowledged_by,
        resolved_at,
        reopened_count
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        first_event_rowid = excluded.first_event_rowid,
        latest_event_rowid = excluded.latest_event_rowid,
        opened_at = excluded.opened_at,
        last_seen_at = excluded.last_seen_at,
        acknowledged_at = excluded.acknowledged_at,
        acknowledged_by = excluded.acknowledged_by,
        resolved_at = excluded.resolved_at,
        reopened_count = excluded.reopened_count`
    )

    const updateProjectionState = db.prepare(
      `insert into agent_runtime_alert_projection_state (
        projection_key,
        last_event_rowid,
        updated_at
      ) values (?, ?, ?)
      on conflict(projection_key) do update set
        last_event_rowid = excluded.last_event_rowid,
        updated_at = excluded.updated_at`
    )

    const existingProjectionState = db.prepare(
      `select last_event_rowid as lastEventRowId
      from agent_runtime_alert_projection_state
      where projection_key = ?`
    ).get(ALERT_PROJECTION_KEY) as { lastEventRowId: number } | undefined

    if (existingProjectionState) {
      const currentAlertableEventRowId = getCurrentAlertableEventRowId()
      if (currentAlertableEventRowId <= existingProjectionState.lastEventRowId) {
        return
      }
    }

    db.exec('begin immediate')
    try {
      const lastEventRowId = getOrCreateProjectionState()
      const newEvents = db.prepare(
        `select
          rowid as eventRowId,
          id as eventId,
          objective_id as objectiveId,
          thread_id as threadId,
          proposal_id as proposalId,
          event_type as eventType,
          payload_json as payloadJson,
          created_at as createdAt
        from agent_runtime_events
        where rowid > ?
          and event_type in (${alertableEventPlaceholders})
        order by rowid asc`
      ).all(
        lastEventRowId,
        ...ALERTABLE_EVENT_TYPE_LIST
      ) as AlertableEventRow[]

      if (newEvents.length === 0) {
        db.exec('commit')
        return
      }

      for (const eventRow of newEvents) {
        const event: ObjectiveRuntimeEventRecord = {
          eventId: eventRow.eventId,
          objectiveId: eventRow.objectiveId,
          threadId: eventRow.threadId,
          proposalId: eventRow.proposalId,
          eventType: eventRow.eventType,
          payload: parseJson(eventRow.payloadJson),
          createdAt: eventRow.createdAt
        }
        const fingerprint = buildFingerprint(event)
        const existing = selectExistingAlert.get(fingerprint) as AlertRow | undefined
        const nextEventCount = (existing?.eventCount ?? 0) + 1
        const isEarlierThanFirstByProjection = existing
          ? eventRow.eventRowId < existing.firstEventRowId
          : true
        const isLatestOrEqualByProjection = existing
          ? eventRow.eventRowId >= existing.latestEventRowId
          : true
        const severity = classifySeverity({
          eventType: event.eventType,
          eventCount: nextEventCount
        })
        const shouldReopen = existing
          ? isLatestOrEqualByProjection && existing.status !== 'open'
          : false
        const nextStatus = shouldReopen
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
        const reopenedCount = (existing?.reopenedCount ?? 0) + (shouldReopen ? 1 : 0)
        const nextLastSeenAt = existing?.lastSeenAt
          ? (event.createdAt.localeCompare(existing.lastSeenAt) > 0
              ? event.createdAt
              : existing.lastSeenAt)
          : event.createdAt

        upsertAlert.run(
          existing?.alertId ?? crypto.randomUUID(),
          fingerprint,
          severity,
          nextStatus,
          existing?.objectiveId ?? event.objectiveId,
          existing?.proposalId ?? event.proposalId,
          isEarlierThanFirstByProjection ? event.eventId : existing?.firstEventId ?? event.eventId,
          isLatestOrEqualByProjection ? event.eventId : existing?.latestEventId ?? event.eventId,
          nextEventCount,
          buildAlertTitle({
            eventType: event.eventType,
            eventCount: nextEventCount
          }),
          isLatestOrEqualByProjection ? buildAlertDetail(event) : existing?.detail ?? null,
          isEarlierThanFirstByProjection ? eventRow.eventRowId : existing?.firstEventRowId ?? eventRow.eventRowId,
          isLatestOrEqualByProjection ? eventRow.eventRowId : existing?.latestEventRowId ?? eventRow.eventRowId,
          isEarlierThanFirstByProjection ? event.createdAt : existing?.openedAt ?? event.createdAt,
          nextLastSeenAt,
          acknowledgedAt,
          acknowledgedBy,
          resolvedAt,
          reopenedCount
        )
      }

      updateProjectionState.run(
        ALERT_PROJECTION_KEY,
        newEvents.at(-1)?.eventRowId ?? lastEventRowId,
        nowIso()
      )
      db.exec('commit')
    } catch (error) {
      db.exec('rollback')
      throw error
    }
  }

  function readAlertProjectionState(): AlertProjectionState {
    const stateRow = db.prepare(
      `select
        last_event_rowid as lastProjectedEventRowId,
        updated_at as updatedAt
      from agent_runtime_alert_projection_state
      where projection_key = ?`
    ).get(ALERT_PROJECTION_KEY) as {
      lastProjectedEventRowId: number
      updatedAt: string
    } | undefined

    return {
      projectionKey: 'runtime_alerts',
      lastProjectedEventRowId: stateRow?.lastProjectedEventRowId ?? 0,
      currentEventRowId: getCurrentAlertableEventRowId(),
      updatedAt: stateRow?.updatedAt ?? null
    }
  }

  function readObjectiveRuntimeAlerts(input: ListObjectiveRuntimeAlertsInput = {}) {
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
        first_event_rowid as firstEventRowId,
        latest_event_rowid as latestEventRowId,
        opened_at as openedAt,
        last_seen_at as lastSeenAt,
        acknowledged_at as acknowledgedAt,
        acknowledged_by as acknowledgedBy,
        resolved_at as resolvedAt,
        reopened_count as reopenedCount
      from agent_runtime_alerts
      where (? is null or objective_id = ?)
        and (? is null or proposal_id = ?)
        and (? is null or status = ?)
      order by
        case severity when 'critical' then 0 else 1 end,
        latest_event_rowid desc,
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

  function listObjectiveRuntimeAlerts(input: ListObjectiveRuntimeAlertsInput = {}) {
    syncObjectiveRuntimeAlerts()
    return readObjectiveRuntimeAlerts(input)
  }

  function readOpenAlertCounts() {
    const rows = db.prepare(
      `select severity, count(*) as count
      from agent_runtime_alerts
      where status != 'resolved'
      group by severity`
    ).all() as Array<{
      severity: ObjectiveRuntimeAlertSeverity
      count: number
    }>

    return rows.reduce((counts, row) => ({
      ...counts,
      [row.severity === 'critical' ? 'criticalAlertCount' : 'warningAlertCount']: row.count
    }), {
      warningAlertCount: 0,
      criticalAlertCount: 0
    })
  }

  function getOpenAlertCounts() {
    syncObjectiveRuntimeAlerts()
    return readOpenAlertCounts()
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
    readObjectiveRuntimeAlerts,
    getOpenAlertCounts,
    readOpenAlertCounts,
    readAlertProjectionState,
    acknowledgeObjectiveRuntimeAlert,
    resolveObjectiveRuntimeAlert,
    syncObjectiveRuntimeAlerts
  }
}
