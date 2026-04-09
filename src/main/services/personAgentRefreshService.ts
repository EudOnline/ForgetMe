import type { AppPaths } from './appPaths'
import type { ArchiveDatabase } from './db'
import {
  appendPersonAgentAuditEvent,
  enqueuePersonAgentRefresh,
  getPersonAgentByCanonicalPersonId,
  listPersonAgentRefreshQueue,
  upsertPersonAgent
} from './governancePersistenceService'
import { materializePersonAgentCapsule } from './personAgentCapsuleService'
import { backfillPersistedPersonAgentInteractionMemory } from './personAgentInteractionMemoryService'
import { getPersonDossier } from './personDossierService'
import { syncPersonAgentFactMemory } from './personAgentFactMemoryService'
import { evaluatePersonAgentPromotion } from './personAgentPromotionService'
import {
  derivePersonAgentStrategyProfile,
  resolveNextPersonAgentStrategyProfile
} from './personAgentStrategyService'
import {
  syncPersonAgentTasks
} from './personAgentTaskService'
import { processPersonAgentRuntimeLoop } from './personAgentRuntimeService'
import type { PersonAgentCapsuleActivationSource } from '../../shared/archiveContracts'

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function resolveBatchLinkedCanonicalPersonIds(db: ArchiveDatabase, batchId: string) {
  const rows = db.prepare(
    `select distinct pm.canonical_person_id as canonicalPersonId
     from relations batch_rel
     join relations person_rel
       on person_rel.target_id = batch_rel.source_id
      and person_rel.source_type = 'person'
      and person_rel.target_type = 'file'
      and person_rel.relation_type in ('mentioned_in_file', 'mentioned_in')
     join person_memberships pm
       on pm.anchor_person_id = person_rel.source_id
      and pm.status = 'active'
     where batch_rel.source_type = 'file'
       and batch_rel.target_type = 'batch'
       and batch_rel.relation_type = 'belongs_to_batch'
       and batch_rel.target_id = ?`
  ).all(batchId) as Array<{ canonicalPersonId: string }>

  return uniqueStrings(rows.map((row) => row.canonicalPersonId))
}

function resolveCapsuleActivationSource(input: {
  strategyAuditSource?: string
  strategyAuditReasons?: string[]
}): PersonAgentCapsuleActivationSource {
  if (input.strategyAuditReasons?.includes('import_batch')) {
    return 'import_batch'
  }

  if (input.strategyAuditSource === 'interaction_promotion') {
    return 'interaction_promotion'
  }

  if (input.strategyAuditSource === 'manual_backfill') {
    return 'manual_backfill'
  }

  return 'refresh_rebuild'
}

export function enqueuePersonAgentRefreshForCanonicalPeople(db: ArchiveDatabase, input: {
  canonicalPersonIds: string[]
  reason: string
  requestedAt?: string
}) {
  const requestedAt = input.requestedAt ?? new Date().toISOString()
  const canonicalPersonIds = uniqueStrings(input.canonicalPersonIds.filter((id) => id.trim().length > 0))

  return canonicalPersonIds.map((canonicalPersonId) => {
    const existing = listPersonAgentRefreshQueue(db, {
      canonicalPersonId,
      status: 'pending'
    })[0] ?? null

    if (!existing) {
      const personAgent = getPersonAgentByCanonicalPersonId(db, {
        canonicalPersonId
      })

      return enqueuePersonAgentRefresh(db, {
        canonicalPersonId,
        personAgentId: personAgent?.personAgentId ?? null,
        status: 'pending',
        reasons: [input.reason],
        requestedAt,
        updatedAt: requestedAt
      })
    }

    const nextReasons = uniqueStrings([
      ...existing.reasons,
      input.reason
    ])

    db.prepare(
      `update person_agent_refresh_queue
       set reasons_json = ?, requested_at = ?, updated_at = ?
       where id = ?`
    ).run(
      JSON.stringify(nextReasons),
      requestedAt,
      requestedAt,
      existing.refreshId
    )

    return listPersonAgentRefreshQueue(db, {
      canonicalPersonId,
      status: 'pending'
    })[0]!
  })
}

export function enqueuePersonAgentRefreshesForBatch(db: ArchiveDatabase, input: {
  batchId: string
  reason?: string
  requestedAt?: string
}) {
  return enqueuePersonAgentRefreshForCanonicalPeople(db, {
    canonicalPersonIds: resolveBatchLinkedCanonicalPersonIds(db, input.batchId),
    reason: input.reason ?? 'import_batch',
    requestedAt: input.requestedAt
  })
}

export function rebuildPersonAgentForCanonicalPerson(db: ArchiveDatabase, input: {
  appPaths?: AppPaths
  canonicalPersonId: string
  now?: string
  strategyAuditSource?: string
  strategyAuditReasons?: string[]
}) {
  const existing = getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })
  const promotion = evaluatePersonAgentPromotion(db, {
    canonicalPersonId: input.canonicalPersonId,
    now: input.now
  })
  const refreshedAt = input.now ?? new Date().toISOString()

  if (promotion.decision === 'unpromoted' && !existing) {
    return null
  }

  const nextStatus = promotion.decision === 'active'
    ? 'active'
    : promotion.decision === 'candidate'
      ? 'candidate'
      : 'demoted'
  const nextAgent = upsertPersonAgent(db, {
    personAgentId: existing?.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    status: nextStatus,
    promotionTier: promotion.promotionTier,
    promotionScore: promotion.promotionScore.totalScore,
    promotionReasonSummary: promotion.reasonSummary,
    factsVersion: existing?.factsVersion ?? 0,
    interactionVersion: existing?.interactionVersion ?? 0,
    lastRefreshedAt: refreshedAt,
    lastActivatedAt: nextStatus === 'active'
      ? (existing?.lastActivatedAt ?? refreshedAt)
      : (existing?.lastActivatedAt ?? null),
    updatedAt: refreshedAt
  })

  if (promotion.decision !== 'unpromoted') {
    const dossier = getPersonDossier(db, {
      canonicalPersonId: input.canonicalPersonId
    })

    if (dossier) {
      syncPersonAgentFactMemory(db, {
        personAgentId: nextAgent.personAgentId,
        canonicalPersonId: input.canonicalPersonId,
        dossier
      })
    }

    if (nextStatus === 'active') {
      backfillPersistedPersonAgentInteractionMemory(db, {
        personAgentId: nextAgent.personAgentId,
        canonicalPersonId: input.canonicalPersonId
      })

      if (dossier) {
        const afterBackfillAgent = getPersonAgentByCanonicalPersonId(db, {
          canonicalPersonId: input.canonicalPersonId
        })
        const resolvedStrategy = resolveNextPersonAgentStrategyProfile({
          existingProfile: afterBackfillAgent?.strategyProfile ?? existing?.strategyProfile ?? null,
          derivedProfile: derivePersonAgentStrategyProfile(db, {
            personAgentId: nextAgent.personAgentId,
            canonicalPersonId: input.canonicalPersonId,
            dossier
          })
        })

        const persistedAgent = upsertPersonAgent(db, {
          personAgentId: nextAgent.personAgentId,
          canonicalPersonId: input.canonicalPersonId,
          status: nextStatus,
          promotionTier: promotion.promotionTier,
          promotionScore: promotion.promotionScore.totalScore,
          promotionReasonSummary: promotion.reasonSummary,
          strategyProfile: resolvedStrategy.nextProfile,
          factsVersion: afterBackfillAgent?.factsVersion ?? nextAgent.factsVersion,
          interactionVersion: afterBackfillAgent?.interactionVersion ?? nextAgent.interactionVersion,
          lastRefreshedAt: refreshedAt,
          lastActivatedAt: afterBackfillAgent?.lastActivatedAt ?? nextAgent.lastActivatedAt,
          updatedAt: refreshedAt
        })

        if (resolvedStrategy.changed && resolvedStrategy.previousProfile) {
          appendPersonAgentAuditEvent(db, {
            personAgentId: persistedAgent.personAgentId,
            canonicalPersonId: input.canonicalPersonId,
            eventKind: 'strategy_profile_updated',
            payload: {
              source: input.strategyAuditSource ?? 'refresh_rebuild',
              reasons: input.strategyAuditReasons ?? [],
              changedFields: resolvedStrategy.changedFields,
              previousProfile: resolvedStrategy.previousProfile,
              nextProfile: resolvedStrategy.nextProfile
            },
            createdAt: refreshedAt
          })
        }
      }
    }
  }

  const rebuiltAgent = getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })

  if (rebuiltAgent?.status === 'active') {
    materializePersonAgentCapsule(db, {
      appPaths: input.appPaths,
      personAgent: rebuiltAgent,
      activationSource: resolveCapsuleActivationSource({
        strategyAuditSource: input.strategyAuditSource,
        strategyAuditReasons: input.strategyAuditReasons
      }),
      checkpointKind: 'refresh',
      taskSnapshotAt: refreshedAt,
      summary: 'Capsule refreshed after the latest person-agent rebuild.',
      summaryPayload: {
        source: input.strategyAuditSource ?? 'refresh_rebuild',
        reasons: input.strategyAuditReasons ?? []
      },
      now: refreshedAt
    })
  }

  return getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })
}

export function processNextPersonAgentRefresh(db: ArchiveDatabase, input: {
  appPaths?: AppPaths
  now?: string
  processRuntimeLoop?: typeof processPersonAgentRuntimeLoop
} = {}) {
  const now = input.now ?? new Date().toISOString()
  const processRuntimeLoop = input.processRuntimeLoop ?? processPersonAgentRuntimeLoop
  const pending = listPersonAgentRefreshQueue(db, {
    status: 'pending'
  })[0] ?? null

  if (!pending) {
    return null
  }

  db.prepare(
    `update person_agent_refresh_queue
     set status = ?, started_at = ?, updated_at = ?
     where id = ?`
  ).run('processing', now, now, pending.refreshId)

  try {
    const refreshedAgent = rebuildPersonAgentForCanonicalPerson(db, {
      appPaths: input.appPaths,
      canonicalPersonId: pending.canonicalPersonId,
      now,
      strategyAuditSource: 'refresh_rebuild',
      strategyAuditReasons: pending.reasons
    })

    db.prepare(
      `update person_agent_refresh_queue
       set person_agent_id = ?, status = ?, completed_at = ?, last_error = ?, updated_at = ?
       where id = ?`
    ).run(
      refreshedAgent?.personAgentId ?? pending.personAgentId ?? null,
      'completed',
      now,
      null,
      now,
      pending.refreshId
    )

    syncPersonAgentTasks(db, {
      canonicalPersonId: pending.canonicalPersonId,
      now
    })
    processRuntimeLoop(db, {
      canonicalPersonId: pending.canonicalPersonId,
      source: 'refresh_sync',
      now
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    db.prepare(
      `update person_agent_refresh_queue
       set status = ?, completed_at = ?, last_error = ?, updated_at = ?
       where id = ?`
    ).run('failed', now, message, now, pending.refreshId)
    throw error
  }

  return listPersonAgentRefreshQueue(db, {}).find((row) => row.refreshId === pending.refreshId) ?? null
}

export function processPendingPersonAgentRefreshes(db: ArchiveDatabase, input: {
  appPaths?: AppPaths
  now?: string
  processRuntimeLoop?: typeof processPersonAgentRuntimeLoop
} = {}) {
  const processed = [] as ReturnType<typeof listPersonAgentRefreshQueue>

  while (listPersonAgentRefreshQueue(db, { status: 'pending' }).length > 0) {
    const next = processNextPersonAgentRefresh(db, input)
    if (!next) {
      break
    }
    processed.push(next)
  }

  return processed
}
