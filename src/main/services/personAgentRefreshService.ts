import type { ArchiveDatabase } from './db'
import {
  enqueuePersonAgentRefresh,
  getPersonAgentByCanonicalPersonId,
  listPersonAgentRefreshQueue,
  upsertPersonAgent
} from './governancePersistenceService'
import { getPersonDossier } from './personDossierService'
import { syncPersonAgentFactMemory } from './personAgentFactMemoryService'
import { evaluatePersonAgentPromotion } from './personAgentPromotionService'

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
  canonicalPersonId: string
  now?: string
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
  }

  return getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })
}

export function processNextPersonAgentRefresh(db: ArchiveDatabase, input: {
  now?: string
} = {}) {
  const now = input.now ?? new Date().toISOString()
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
      canonicalPersonId: pending.canonicalPersonId,
      now
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
  now?: string
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
