import crypto from 'node:crypto'
import type {
  AgentObjectiveInitiator,
  AgentObjectiveKind,
  AgentProposalRecord,
  AgentProposalRiskLevel,
  ObjectiveRuntimeEventRecord,
  ObjectiveRuntimeEventType,
  ObjectiveRuntimeScorecard
} from '../../shared/objectiveRuntimeContracts'
import type { ArchiveDatabase } from './db'

type ScorecardEventRow = {
  eventRowId: number
  objectiveId: string
  proposalId: string | null
  eventType: ObjectiveRuntimeEventType
  payloadJson: string
}

type ScorecardProjectionState = {
  projectionKey: 'runtime_scorecard'
  lastProjectedEventRowId: number
  currentEventRowId: number
  updatedAt: string | null
}

const SCORECARD_PROJECTION_KEY = 'runtime_scorecard'

function nowIso() {
  return new Date().toISOString()
}

function serializeJson(value: unknown) {
  return JSON.stringify(value)
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

function toTimestamp(value: string) {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? Date.now() : timestamp
}

function buildWindowStatsForCounts(
  currentCount: number,
  previousCount: number
) {
  return {
    new24h: currentCount,
    resolved24h: Math.max(previousCount - currentCount, 0),
    net24h: currentCount - previousCount
  }
}

function buildWindowBounds(now: string) {
  const currentTimestamp = toTimestamp(now)
  const currentWindowStart = currentTimestamp - (24 * 60 * 60 * 1000)
  const previousWindowStart = currentWindowStart - (24 * 60 * 60 * 1000)

  return {
    currentWindowStartIso: new Date(currentWindowStart).toISOString(),
    currentWindowEndIso: new Date(currentTimestamp).toISOString(),
    previousWindowStartIso: new Date(previousWindowStart).toISOString()
  }
}

function buildProposalPayload(proposal: AgentProposalRecord) {
  return {
    proposalKind: proposal.proposalKind,
    proposalRiskLevel: proposal.proposalRiskLevel,
    autonomyDecision: proposal.autonomyDecision,
    ownerRole: proposal.ownerRole,
    requiresOperatorConfirmation: proposal.requiresOperatorConfirmation,
    status: proposal.status
  }
}

export function createObjectiveRuntimeTelemetryService(dependencies: {
  db: ArchiveDatabase
  now?: () => string
}) {
  const { db } = dependencies
  const now = dependencies.now ?? nowIso

  function countEventsInWindow(
    eventType: ObjectiveRuntimeEventType,
    startIso: string,
    endIso: string,
    inclusiveEnd: boolean
  ) {
    const comparator = inclusiveEnd ? '<=' : '<'
    const row = db.prepare(
      `select count(*) as count
      from agent_runtime_events
      where event_type = ?
        and created_at >= ?
        and created_at ${comparator} ?`
    ).get(eventType, startIso, endIso) as { count: number }

    return row.count
  }

  function buildWindowStats(eventType: ObjectiveRuntimeEventType, currentTime: string) {
    const bounds = buildWindowBounds(currentTime)
    const currentCount = countEventsInWindow(
      eventType,
      bounds.currentWindowStartIso,
      bounds.currentWindowEndIso,
      true
    )
    const previousCount = countEventsInWindow(
      eventType,
      bounds.previousWindowStartIso,
      bounds.currentWindowStartIso,
      false
    )

    return buildWindowStatsForCounts(currentCount, previousCount)
  }

  function getScorecardProjectionBaselineLastEventRowId() {
    const proposalStatCount = db.prepare(
      'select count(*) as count from agent_runtime_proposal_stats'
    ).get() as { count: number }
    const objectiveStatCount = db.prepare(
      'select count(*) as count from agent_runtime_objective_stats'
    ).get() as { count: number }

    if (proposalStatCount.count === 0 && objectiveStatCount.count === 0) {
      return 0
    }

    const row = db.prepare(
      'select coalesce(max(rowid), 0) as lastEventRowId from agent_runtime_events'
    ).get() as { lastEventRowId: number }

    return row.lastEventRowId
  }

  function getOrCreateScorecardProjectionState() {
    const existing = db.prepare(
      `select last_event_rowid as lastEventRowId
      from agent_runtime_scorecard_projection_state
      where projection_key = ?`
    ).get(SCORECARD_PROJECTION_KEY) as { lastEventRowId: number } | undefined

    if (existing) {
      return existing.lastEventRowId
    }

    const baselineLastEventRowId = getScorecardProjectionBaselineLastEventRowId()
    db.prepare(
      `insert into agent_runtime_scorecard_projection_state (
        projection_key,
        last_event_rowid,
        updated_at
      ) values (?, ?, ?)`
    ).run(
      SCORECARD_PROJECTION_KEY,
      baselineLastEventRowId,
      nowIso()
    )

    return baselineLastEventRowId
  }

  function getCurrentRuntimeEventRowId() {
    const row = db.prepare(
      'select coalesce(max(rowid), 0) as lastEventRowId from agent_runtime_events'
    ).get() as { lastEventRowId: number }

    return row.lastEventRowId
  }

  function syncScorecardProjection() {
    const upsertProposalStats = db.prepare(
      `insert into agent_runtime_proposal_stats (
        proposal_id,
        risk_level,
        created,
        auto_committed,
        awaiting_operator,
        vetoed,
        blocked,
        budget_exhausted,
        tool_timeout
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(proposal_id) do update set
        risk_level = coalesce(excluded.risk_level, agent_runtime_proposal_stats.risk_level),
        created = max(agent_runtime_proposal_stats.created, excluded.created),
        auto_committed = max(agent_runtime_proposal_stats.auto_committed, excluded.auto_committed),
        awaiting_operator = max(agent_runtime_proposal_stats.awaiting_operator, excluded.awaiting_operator),
        vetoed = max(agent_runtime_proposal_stats.vetoed, excluded.vetoed),
        blocked = max(agent_runtime_proposal_stats.blocked, excluded.blocked),
        budget_exhausted = max(agent_runtime_proposal_stats.budget_exhausted, excluded.budget_exhausted),
        tool_timeout = max(agent_runtime_proposal_stats.tool_timeout, excluded.tool_timeout)`
    )
    const upsertObjectiveStats = db.prepare(
      `insert into agent_runtime_objective_stats (
        objective_id,
        stalled,
        completed,
        completed_round_count
      ) values (?, ?, ?, ?)
      on conflict(objective_id) do update set
        stalled = max(agent_runtime_objective_stats.stalled, excluded.stalled),
        completed = max(agent_runtime_objective_stats.completed, excluded.completed),
        completed_round_count = coalesce(excluded.completed_round_count, agent_runtime_objective_stats.completed_round_count)`
    )
    const updateProjectionState = db.prepare(
      `insert into agent_runtime_scorecard_projection_state (
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
      from agent_runtime_scorecard_projection_state
      where projection_key = ?`
    ).get(SCORECARD_PROJECTION_KEY) as { lastEventRowId: number } | undefined

    if (existingProjectionState) {
      const currentRuntimeEventRowId = getCurrentRuntimeEventRowId()
      if (currentRuntimeEventRowId <= existingProjectionState.lastEventRowId) {
        return
      }
    }

    db.exec('begin immediate')
    try {
      const lastEventRowId = getOrCreateScorecardProjectionState()
      const newEvents = db.prepare(
        `select
          rowid as eventRowId,
          objective_id as objectiveId,
          proposal_id as proposalId,
          event_type as eventType,
          payload_json as payloadJson
        from agent_runtime_events
        where rowid > ?
        order by rowid asc`
      ).all(lastEventRowId) as ScorecardEventRow[]

      if (newEvents.length === 0) {
        db.exec('commit')
        return
      }

      for (const event of newEvents) {
        const payload = parseJson(event.payloadJson)
        const riskLevel = typeof payload.proposalRiskLevel === 'string'
          ? payload.proposalRiskLevel
          : null

        if (event.proposalId) {
          upsertProposalStats.run(
            event.proposalId,
            riskLevel,
            event.eventType === 'proposal_created' ? 1 : 0,
            event.eventType === 'proposal_auto_committed' ? 1 : 0,
            event.eventType === 'proposal_awaiting_operator' ? 1 : 0,
            event.eventType === 'proposal_vetoed' ? 1 : 0,
            event.eventType === 'proposal_blocked' ? 1 : 0,
            event.eventType === 'subagent_budget_exhausted' ? 1 : 0,
            event.eventType === 'tool_timeout' ? 1 : 0
          )
        }

        if (event.eventType === 'objective_stalled' || event.eventType === 'objective_completed') {
          upsertObjectiveStats.run(
            event.objectiveId,
            event.eventType === 'objective_stalled' ? 1 : 0,
            event.eventType === 'objective_completed' ? 1 : 0,
            event.eventType === 'objective_completed' && typeof payload.roundCount === 'number'
              ? payload.roundCount
              : null
          )
        }
      }

      updateProjectionState.run(
        SCORECARD_PROJECTION_KEY,
        newEvents.at(-1)?.eventRowId ?? lastEventRowId,
        nowIso()
      )
      db.exec('commit')
    } catch (error) {
      db.exec('rollback')
      throw error
    }
  }

  function recordEvent(input: {
    objectiveId: string
    threadId?: string | null
    proposalId?: string | null
    eventType: ObjectiveRuntimeEventType
    payload?: Record<string, unknown>
    createdAt?: string
  }) {
    const eventId = crypto.randomUUID()
    const createdAt = input.createdAt ?? now()

    db.prepare(
      `insert into agent_runtime_events (
        id,
        objective_id,
        thread_id,
        proposal_id,
        event_type,
        payload_json,
        created_at
      ) values (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      eventId,
      input.objectiveId,
      input.threadId ?? null,
      input.proposalId ?? null,
      input.eventType,
      serializeJson(input.payload ?? {}),
      createdAt
    )

    return {
      eventId,
      objectiveId: input.objectiveId,
      threadId: input.threadId ?? null,
      proposalId: input.proposalId ?? null,
      eventType: input.eventType,
      payload: input.payload ?? {},
      createdAt
    } satisfies ObjectiveRuntimeEventRecord
  }

  function listEvents(input?: {
    objectiveId?: string
    proposalId?: string
  }) {
    return db.prepare(
      `select
        id as eventId,
        objective_id as objectiveId,
        thread_id as threadId,
        proposal_id as proposalId,
        event_type as eventType,
        payload_json as payloadJson,
        created_at as createdAt
      from agent_runtime_events
      where (? is null or objective_id = ?)
        and (? is null or proposal_id = ?)
      order by created_at asc, rowid asc`
    ).all(
      input?.objectiveId ?? null,
      input?.objectiveId ?? null,
      input?.proposalId ?? null,
      input?.proposalId ?? null
    ).map((row) => ({
      eventId: (row as { eventId: string }).eventId,
      objectiveId: (row as { objectiveId: string }).objectiveId,
      threadId: (row as { threadId: string | null }).threadId,
      proposalId: (row as { proposalId: string | null }).proposalId,
      eventType: (row as { eventType: ObjectiveRuntimeEventType }).eventType,
      payload: parseJson((row as { payloadJson: string }).payloadJson),
      createdAt: (row as { createdAt: string }).createdAt
    })) as ObjectiveRuntimeEventRecord[]
  }

  function getScorecard(): ObjectiveRuntimeScorecard {
    syncScorecardProjection()
    const currentTime = now()
    const backlogWindowStats = buildWindowStats('proposal_awaiting_operator', currentTime)
    const stalledWindowStats = buildWindowStats('objective_stalled', currentTime)
    const blockedWindowStats = buildWindowStats('proposal_blocked', currentTime)
    const proposalAggregateRow = db.prepare(
      `select
        coalesce(sum(created), 0) as totalProposalCount,
        coalesce(sum(auto_committed), 0) as autoCommitCount,
        coalesce(sum(awaiting_operator), 0) as operatorGatedCount,
        coalesce(sum(vetoed), 0) as vetoCount,
        coalesce(sum(blocked), 0) as blockedCount,
        coalesce(sum(budget_exhausted), 0) as budgetExhaustedCount,
        coalesce(sum(tool_timeout), 0) as toolTimeoutCount
      from agent_runtime_proposal_stats`
    ).get() as {
      totalProposalCount: number
      autoCommitCount: number
      operatorGatedCount: number
      vetoCount: number
      blockedCount: number
      budgetExhaustedCount: number
      toolTimeoutCount: number
    }
    const objectiveAggregateRow = db.prepare(
      `select
        coalesce(sum(stalled), 0) as stalledObjectiveCount,
        coalesce(sum(completed), 0) as completedObjectiveCount,
        avg(completed_round_count) as meanRoundsToCompletion
      from agent_runtime_objective_stats
      where completed = 1 or stalled = 1`
    ).get() as {
      stalledObjectiveCount: number
      completedObjectiveCount: number
      meanRoundsToCompletion: number | null
    }
    const perRisk: Record<AgentProposalRiskLevel, { total: number; autoCommitted: number }> = {
      low: { total: 0, autoCommitted: 0 },
      medium: { total: 0, autoCommitted: 0 },
      high: { total: 0, autoCommitted: 0 },
      critical: { total: 0, autoCommitted: 0 }
    }

    const perRiskRows = db.prepare(
      `select
        risk_level as riskLevel,
        coalesce(sum(created), 0) as total,
        coalesce(sum(auto_committed), 0) as autoCommitted,
        coalesce(sum(awaiting_operator), 0) as awaitingOperator
      from agent_runtime_proposal_stats
      where risk_level is not null
      group by risk_level`
    ).all() as Array<{
      riskLevel: AgentProposalRiskLevel
      total: number
      autoCommitted: number
      awaitingOperator: number
    }>

    let criticalAwaitingCount = 0
    for (const row of perRiskRows) {
      perRisk[row.riskLevel] = {
        total: row.total,
        autoCommitted: row.autoCommitted
      }

      if (row.riskLevel === 'critical') {
        criticalAwaitingCount = row.awaitingOperator
      }
    }

    const totalObjectivesRow = db.prepare(
      'select count(*) as count from agent_objectives'
    ).get() as { count: number }
    const currentAwaitingProposalRows = db.prepare(
      'select objective_id as objectiveId from agent_proposals where status = ?'
    ).all('awaiting_operator') as Array<{ objectiveId: string }>
    const currentObjectiveBacklogRows = db.prepare(
      'select id as objectiveId from agent_objectives where requires_operator_input = 1'
    ).all() as Array<{ objectiveId: string }>
    const backlogObjectiveIds = new Set<string>([
      ...currentAwaitingProposalRows.map((row) => row.objectiveId),
      ...currentObjectiveBacklogRows.map((row) => row.objectiveId)
    ])
    const meanRoundsToCompletion = objectiveAggregateRow.meanRoundsToCompletion != null
      ? Number(objectiveAggregateRow.meanRoundsToCompletion.toFixed(2))
      : null

    return {
      totalProposalCount: proposalAggregateRow.totalProposalCount,
      autoCommitCount: proposalAggregateRow.autoCommitCount,
      operatorGatedCount: proposalAggregateRow.operatorGatedCount,
      vetoCount: proposalAggregateRow.vetoCount,
      blockedCount: proposalAggregateRow.blockedCount,
      totalObjectiveCount: totalObjectivesRow.count,
      stalledObjectiveCount: objectiveAggregateRow.stalledObjectiveCount,
      completedObjectiveCount: objectiveAggregateRow.completedObjectiveCount,
      criticalGateRate: roundRate(
        criticalAwaitingCount,
        perRisk.critical.total
      ),
      vetoRate: roundRate(proposalAggregateRow.vetoCount, proposalAggregateRow.totalProposalCount),
      blockedRate: roundRate(proposalAggregateRow.blockedCount, proposalAggregateRow.totalProposalCount),
      stalledObjectiveRate: roundRate(objectiveAggregateRow.stalledObjectiveCount, totalObjectivesRow.count),
      meanRoundsToCompletion,
      operatorBacklogSize: backlogObjectiveIds.size,
      budgetExhaustedCount: proposalAggregateRow.budgetExhaustedCount,
      toolTimeoutCount: proposalAggregateRow.toolTimeoutCount,
      warningAlertCount: 0,
      criticalAlertCount: 0,
      backlogNew24h: backlogWindowStats.new24h,
      backlogResolved24h: backlogWindowStats.resolved24h,
      backlogNet24h: backlogWindowStats.net24h,
      stalledNew24h: stalledWindowStats.new24h,
      stalledResolved24h: stalledWindowStats.resolved24h,
      stalledNet24h: stalledWindowStats.net24h,
      blockedNew24h: blockedWindowStats.new24h,
      blockedResolved24h: blockedWindowStats.resolved24h,
      blockedNet24h: blockedWindowStats.net24h,
      backlogDelta24h: backlogWindowStats.net24h,
      stalledDelta24h: stalledWindowStats.net24h,
      blockedDelta24h: blockedWindowStats.net24h,
      runtimeAuditSummary: {
        topFailureProposalKinds: [],
        topFailureSpecializations: [],
        recoveryExhaustedReasons: [],
        reopenedAlertCount: 0,
        reopenedAlertRate: null
      },
      autoCommitRateByRiskLevel: {
        low: {
          total: perRisk.low.total,
          autoCommitted: perRisk.low.autoCommitted,
          rate: roundRate(perRisk.low.autoCommitted, perRisk.low.total)
        },
        medium: {
          total: perRisk.medium.total,
          autoCommitted: perRisk.medium.autoCommitted,
          rate: roundRate(perRisk.medium.autoCommitted, perRisk.medium.total)
        },
        high: {
          total: perRisk.high.total,
          autoCommitted: perRisk.high.autoCommitted,
          rate: roundRate(perRisk.high.autoCommitted, perRisk.high.total)
        },
        critical: {
          total: perRisk.critical.total,
          autoCommitted: perRisk.critical.autoCommitted,
          rate: roundRate(perRisk.critical.autoCommitted, perRisk.critical.total)
        }
      }
    }
  }

  function readScorecardProjectionState(): ScorecardProjectionState {
    const stateRow = db.prepare(
      `select
        last_event_rowid as lastProjectedEventRowId,
        updated_at as updatedAt
      from agent_runtime_scorecard_projection_state
      where projection_key = ?`
    ).get(SCORECARD_PROJECTION_KEY) as {
      lastProjectedEventRowId: number
      updatedAt: string
    } | undefined

    return {
      projectionKey: 'runtime_scorecard',
      lastProjectedEventRowId: stateRow?.lastProjectedEventRowId ?? 0,
      currentEventRowId: getCurrentRuntimeEventRowId(),
      updatedAt: stateRow?.updatedAt ?? null
    }
  }

  function recordObjectiveStarted(input: {
    objectiveId: string
    threadId: string
    objectiveKind: AgentObjectiveKind
    initiatedBy: AgentObjectiveInitiator
    createdAt?: string
  }) {
    return recordEvent({
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      eventType: 'objective_started',
      createdAt: input.createdAt,
      payload: {
        objectiveKind: input.objectiveKind,
        initiatedBy: input.initiatedBy
      }
    })
  }

  function recordObjectiveStalled(input: {
    objectiveId: string
    threadId: string
    roundCount: number
    createdAt?: string
  }) {
    return recordEvent({
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      eventType: 'objective_stalled',
      createdAt: input.createdAt,
      payload: {
        roundCount: input.roundCount
      }
    })
  }

  function recordObjectiveCompleted(input: {
    objectiveId: string
    threadId: string
    roundCount: number
    createdAt?: string
  }) {
    return recordEvent({
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      eventType: 'objective_completed',
      createdAt: input.createdAt,
      payload: {
        roundCount: input.roundCount
      }
    })
  }

  function recordProposalCreated(proposal: AgentProposalRecord, createdAt?: string) {
    return recordEvent({
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_created',
      createdAt,
      payload: buildProposalPayload(proposal)
    })
  }

  function recordProposalAutoCommitted(proposal: AgentProposalRecord, createdAt?: string) {
    return recordEvent({
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_auto_committed',
      createdAt,
      payload: buildProposalPayload(proposal)
    })
  }

  function recordProposalAwaitingOperator(proposal: AgentProposalRecord, createdAt?: string) {
    return recordEvent({
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_awaiting_operator',
      createdAt,
      payload: buildProposalPayload(proposal)
    })
  }

  function recordProposalBlocked(proposal: AgentProposalRecord, createdAt?: string) {
    return recordEvent({
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_blocked',
      createdAt,
      payload: buildProposalPayload(proposal)
    })
  }

  function recordProposalVetoed(proposal: AgentProposalRecord, createdAt?: string) {
    return recordEvent({
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_vetoed',
      createdAt,
      payload: buildProposalPayload(proposal)
    })
  }

  return {
    recordEvent,
    listEvents,
    getScorecard,
    readScorecardProjectionState,
    recordObjectiveStarted,
    recordObjectiveStalled,
    recordObjectiveCompleted,
    recordProposalCreated,
    recordProposalAutoCommitted,
    recordProposalAwaitingOperator,
    recordProposalBlocked,
    recordProposalVetoed
  }
}
