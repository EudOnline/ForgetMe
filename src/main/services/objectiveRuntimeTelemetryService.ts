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
}) {
  const { db } = dependencies

  function recordEvent(input: {
    objectiveId: string
    threadId?: string | null
    proposalId?: string | null
    eventType: ObjectiveRuntimeEventType
    payload?: Record<string, unknown>
    createdAt?: string
  }) {
    const eventId = crypto.randomUUID()
    const createdAt = input.createdAt ?? nowIso()

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
    const events = listEvents()
    const createdProposalIds = new Set<string>()
    const autoCommittedProposalIds = new Set<string>()
    const operatorGatedProposalIds = new Set<string>()
    const vetoedProposalIds = new Set<string>()
    const blockedProposalIds = new Set<string>()
    const stalledObjectiveIds = new Set<string>()
    const completedObjectiveIds = new Set<string>()
    const completedRoundCounts = new Map<string, number>()
    const perRisk: Record<AgentProposalRiskLevel, { total: number; autoCommitted: number }> = {
      low: { total: 0, autoCommitted: 0 },
      medium: { total: 0, autoCommitted: 0 },
      high: { total: 0, autoCommitted: 0 },
      critical: { total: 0, autoCommitted: 0 }
    }
    const proposalRiskLevels = new Map<string, AgentProposalRiskLevel>()

    for (const event of events) {
      const riskLevel = typeof event.payload.proposalRiskLevel === 'string'
        ? event.payload.proposalRiskLevel as AgentProposalRiskLevel
        : null

      if (event.proposalId && riskLevel) {
        proposalRiskLevels.set(event.proposalId, riskLevel)
      }

      switch (event.eventType) {
        case 'proposal_created':
          if (event.proposalId) {
            createdProposalIds.add(event.proposalId)
            if (riskLevel) {
              perRisk[riskLevel].total += 1
            }
          }
          break
        case 'proposal_auto_committed':
          if (event.proposalId) {
            autoCommittedProposalIds.add(event.proposalId)
            const proposalRiskLevel = proposalRiskLevels.get(event.proposalId)
            if (proposalRiskLevel) {
              perRisk[proposalRiskLevel].autoCommitted += 1
            }
          }
          break
        case 'proposal_awaiting_operator':
          if (event.proposalId) {
            operatorGatedProposalIds.add(event.proposalId)
          }
          break
        case 'proposal_vetoed':
          if (event.proposalId) {
            vetoedProposalIds.add(event.proposalId)
          }
          break
        case 'proposal_blocked':
          if (event.proposalId) {
            blockedProposalIds.add(event.proposalId)
          }
          break
        case 'objective_stalled':
          stalledObjectiveIds.add(event.objectiveId)
          break
        case 'objective_completed':
          completedObjectiveIds.add(event.objectiveId)
          if (typeof event.payload.roundCount === 'number') {
            completedRoundCounts.set(event.objectiveId, event.payload.roundCount)
          }
          break
        default:
          break
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
    const roundCounts = [...completedRoundCounts.values()]
    const meanRoundsToCompletion = roundCounts.length
      ? Number((roundCounts.reduce((sum, value) => sum + value, 0) / roundCounts.length).toFixed(2))
      : null

    return {
      totalProposalCount: createdProposalIds.size,
      autoCommitCount: autoCommittedProposalIds.size,
      operatorGatedCount: operatorGatedProposalIds.size,
      vetoCount: vetoedProposalIds.size,
      blockedCount: blockedProposalIds.size,
      totalObjectiveCount: totalObjectivesRow.count,
      stalledObjectiveCount: stalledObjectiveIds.size,
      completedObjectiveCount: completedObjectiveIds.size,
      criticalGateRate: roundRate(
        [...operatorGatedProposalIds].filter((proposalId) => proposalRiskLevels.get(proposalId) === 'critical').length,
        perRisk.critical.total
      ),
      vetoRate: roundRate(vetoedProposalIds.size, createdProposalIds.size),
      blockedRate: roundRate(blockedProposalIds.size, createdProposalIds.size),
      stalledObjectiveRate: roundRate(stalledObjectiveIds.size, totalObjectivesRow.count),
      meanRoundsToCompletion,
      operatorBacklogSize: backlogObjectiveIds.size,
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
