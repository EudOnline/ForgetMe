import type {
  ObjectiveRuntimeAuditBucket,
  ObjectiveRuntimeAuditSummary,
  ObjectiveRuntimeEventType
} from '../../shared/objectiveRuntimeContracts'
import type { ArchiveDatabase } from './db'

type AuditEventRow = {
  eventRowId: number
  proposalId: string | null
  eventType: ObjectiveRuntimeEventType
  payloadJson: string
}

type ProjectionStateRow = {
  lastEventRowId: number
}

type ProposalSnapshot = {
  proposalKind: string
  payload: Record<string, unknown>
}

type AuditProjectionState = {
  projectionKey: 'runtime_audit'
  lastProjectedEventRowId: number
  currentEventRowId: number
  updatedAt: string | null
}

type BucketKind =
  | 'proposal_kind'
  | 'specialization'
  | 'recovery_reason'

const FAILURE_AUDIT_EVENT_TYPES = [
  'proposal_blocked',
  'proposal_vetoed',
  'objective_stalled',
  'subagent_budget_exhausted',
  'tool_timeout',
  'recovery_exhausted'
] as const satisfies ObjectiveRuntimeEventType[]
const FAILURE_AUDIT_EVENT_TYPE_PLACEHOLDERS = FAILURE_AUDIT_EVENT_TYPES.map(() => '?').join(', ')
const AUDIT_PROJECTION_KEY = 'runtime_audit'

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

function roundRate(numerator: number, denominator: number) {
  if (!denominator) {
    return null
  }

  return Number((numerator / denominator).toFixed(4))
}

export function createObjectiveRuntimeAuditService(dependencies: {
  db: ArchiveDatabase
}) {
  const { db } = dependencies

  function getProjectionBaselineLastEventRowId() {
    const bucketRowCount = db.prepare(
      'select count(*) as count from agent_runtime_audit_buckets'
    ).get() as { count: number }

    if (bucketRowCount.count === 0) {
      return 0
    }

    const row = db.prepare(
      `select coalesce(max(rowid), 0) as lastEventRowId
      from agent_runtime_events
      where event_type in (${FAILURE_AUDIT_EVENT_TYPE_PLACEHOLDERS})`
    ).get(...FAILURE_AUDIT_EVENT_TYPES) as { lastEventRowId: number }

    return row.lastEventRowId
  }

  function getOrCreateProjectionState() {
    const existing = db.prepare(
      `select last_event_rowid as lastEventRowId
      from agent_runtime_audit_projection_state
      where projection_key = ?`
    ).get(AUDIT_PROJECTION_KEY) as ProjectionStateRow | undefined

    if (existing) {
      return existing.lastEventRowId
    }

    const baselineLastEventRowId = getProjectionBaselineLastEventRowId()
    db.prepare(
      `insert into agent_runtime_audit_projection_state (
        projection_key,
        last_event_rowid,
        updated_at
      ) values (?, ?, ?)`
    ).run(
      AUDIT_PROJECTION_KEY,
      baselineLastEventRowId,
      nowIso()
    )

    return baselineLastEventRowId
  }

  function getCurrentAuditEventRowId() {
    const row = db.prepare(
      `select coalesce(max(rowid), 0) as lastEventRowId
      from agent_runtime_events
      where event_type in (${FAILURE_AUDIT_EVENT_TYPE_PLACEHOLDERS})`
    ).get(...FAILURE_AUDIT_EVENT_TYPES) as { lastEventRowId: number }

    return row.lastEventRowId
  }

  function syncRuntimeAuditProjection() {
    const selectProposalSnapshot = db.prepare(
      `select
        proposal_kind as proposalKind,
        payload_json as payloadJson
      from agent_proposals
      where id = ?`
    )
    const upsertBucket = db.prepare(
      `insert into agent_runtime_audit_buckets (
        bucket_kind,
        bucket_label,
        count
      ) values (?, ?, 1)
      on conflict(bucket_kind, bucket_label) do update set
        count = agent_runtime_audit_buckets.count + 1`
    )
    const updateProjectionState = db.prepare(
      `insert into agent_runtime_audit_projection_state (
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
      from agent_runtime_audit_projection_state
      where projection_key = ?`
    ).get(AUDIT_PROJECTION_KEY) as ProjectionStateRow | undefined

    if (existingProjectionState) {
      const currentAuditEventRowId = getCurrentAuditEventRowId()
      if (currentAuditEventRowId <= existingProjectionState.lastEventRowId) {
        return
      }
    }

    db.exec('begin immediate')
    try {
      const lastEventRowId = getOrCreateProjectionState()
      const newEvents = db.prepare(
        `select
          rowid as eventRowId,
          proposal_id as proposalId,
          event_type as eventType,
          payload_json as payloadJson
        from agent_runtime_events
        where rowid > ?
          and event_type in (${FAILURE_AUDIT_EVENT_TYPE_PLACEHOLDERS})
        order by rowid asc`
      ).all(
        lastEventRowId,
        ...FAILURE_AUDIT_EVENT_TYPES
      ) as AuditEventRow[]

      if (newEvents.length === 0) {
        db.exec('commit')
        return
      }

      for (const event of newEvents) {
        const payload = parseJson(event.payloadJson)
        const proposalRow = event.proposalId
          ? selectProposalSnapshot.get(event.proposalId) as {
            proposalKind: string
            payloadJson: string
          } | undefined
          : undefined
        const proposalSnapshot: ProposalSnapshot | null = proposalRow
          ? {
            proposalKind: proposalRow.proposalKind,
            payload: parseJson(proposalRow.payloadJson)
          }
          : null

        const proposalKind = typeof payload.proposalKind === 'string'
          ? payload.proposalKind
          : proposalSnapshot?.proposalKind ?? (event.eventType === 'objective_stalled' ? 'objective_stalled' : null)
        const specialization = typeof payload.specialization === 'string'
          ? payload.specialization
          : typeof proposalSnapshot?.payload.specialization === 'string'
            ? proposalSnapshot.payload.specialization
            : proposalSnapshot?.proposalKind === 'verify_external_claim'
              ? 'web-verifier'
              : null
        const recoveryReason = event.eventType === 'recovery_exhausted' && typeof payload.reason === 'string'
          ? payload.reason
          : null

        if (proposalKind) {
          upsertBucket.run('proposal_kind', proposalKind)
        }

        if (specialization) {
          upsertBucket.run('specialization', specialization)
        }

        if (recoveryReason) {
          upsertBucket.run('recovery_reason', recoveryReason)
        }
      }

      updateProjectionState.run(
        AUDIT_PROJECTION_KEY,
        newEvents.at(-1)?.eventRowId ?? lastEventRowId,
        nowIso()
      )
      db.exec('commit')
    } catch (error) {
      db.exec('rollback')
      throw error
    }
  }

  function readTopBuckets(bucketKind: BucketKind, limit = 3): ObjectiveRuntimeAuditBucket[] {
    return db.prepare(
      `select
        bucket_label as label,
        count
      from agent_runtime_audit_buckets
      where bucket_kind = ?
      order by count desc, bucket_label asc
      limit ?`
    ).all(bucketKind, limit) as ObjectiveRuntimeAuditBucket[]
  }

  function readRuntimeAuditSummary(): ObjectiveRuntimeAuditSummary {
    const reopenedAlertCounts = db.prepare(
      `select
        count(*) as totalAlertCount,
        sum(case when reopened_count > 0 then 1 else 0 end) as reopenedAlertCount
      from agent_runtime_alerts`
    ).get() as {
      totalAlertCount: number
      reopenedAlertCount: number | null
    }

    return {
      topFailureProposalKinds: readTopBuckets('proposal_kind'),
      topFailureSpecializations: readTopBuckets('specialization'),
      recoveryExhaustedReasons: readTopBuckets('recovery_reason'),
      reopenedAlertCount: reopenedAlertCounts.reopenedAlertCount ?? 0,
      reopenedAlertRate: roundRate(
        reopenedAlertCounts.reopenedAlertCount ?? 0,
        reopenedAlertCounts.totalAlertCount
      )
    }
  }

  function getRuntimeAuditSummary() {
    syncRuntimeAuditProjection()
    return readRuntimeAuditSummary()
  }

  function readAuditProjectionState(): AuditProjectionState {
    const stateRow = db.prepare(
      `select
        last_event_rowid as lastProjectedEventRowId,
        updated_at as updatedAt
      from agent_runtime_audit_projection_state
      where projection_key = ?`
    ).get(AUDIT_PROJECTION_KEY) as {
      lastProjectedEventRowId: number
      updatedAt: string
    } | undefined

    return {
      projectionKey: 'runtime_audit',
      lastProjectedEventRowId: stateRow?.lastProjectedEventRowId ?? 0,
      currentEventRowId: getCurrentAuditEventRowId(),
      updatedAt: stateRow?.updatedAt ?? null
    }
  }

  return {
    syncRuntimeAuditProjection,
    readRuntimeAuditSummary,
    getRuntimeAuditSummary,
    readAuditProjectionState
  }
}
