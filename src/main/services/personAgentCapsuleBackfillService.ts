import path from 'node:path'
import type { AppPaths } from './appPaths'
import { openDatabase, runMigrations } from './db'
import type { ArchiveDatabase } from './db'
import {
  getPersonAgentByCanonicalPersonId,
  getPersonAgentCapsule
} from './governancePersistenceService'
import { materializePersonAgentCapsule } from './personAgentCapsuleService'

export type PersonAgentCapsuleBackfillResult = {
  scannedCount: number
  repairedCount: number
  skippedCount: number
  repairedPersonAgentIds: string[]
}

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

function listActiveCanonicalPersonIds(db: ArchiveDatabase, limit?: number) {
  const rows = db.prepare(
    `select canonical_person_id as canonicalPersonId
     from person_agents
     where status = 'active'
     order by updated_at desc, id asc`
  ).all() as Array<{ canonicalPersonId: string }>

  if (limit && limit > 0) {
    return rows.slice(0, limit)
  }

  return rows
}

export function backfillPersonAgentCapsules(db: ArchiveDatabase, input: {
  appPaths?: AppPaths
  now?: string
  limit?: number
} = {}): PersonAgentCapsuleBackfillResult {
  const now = input.now ?? new Date().toISOString()
  const repairedPersonAgentIds: string[] = []
  let repairedCount = 0
  let skippedCount = 0

  const activeCanonicalPersonIds = listActiveCanonicalPersonIds(db, input.limit)

  for (const row of activeCanonicalPersonIds) {
    const personAgent = getPersonAgentByCanonicalPersonId(db, {
      canonicalPersonId: row.canonicalPersonId
    })

    if (!personAgent || personAgent.status !== 'active') {
      skippedCount += 1
      continue
    }

    const capsule = getPersonAgentCapsule(db, {
      personAgentId: personAgent.personAgentId
    })

    if (capsule?.latestCheckpointId) {
      skippedCount += 1
      continue
    }

    const repairedCapsule = materializePersonAgentCapsule(db, {
      appPaths: input.appPaths,
      personAgent,
      activationSource: 'manual_backfill',
      checkpointKind: 'backfill',
      taskSnapshotAt: now,
      summary: 'Capsule repaired for a historical active person-agent record.',
      summaryPayload: {
        source: 'manual_backfill',
        repairedExistingCapsule: Boolean(capsule)
      },
      now
    })

    if (repairedCapsule) {
      repairedCount += 1
      repairedPersonAgentIds.push(personAgent.personAgentId)
    } else {
      skippedCount += 1
    }
  }

  return {
    scannedCount: activeCanonicalPersonIds.length,
    repairedCount,
    skippedCount,
    repairedPersonAgentIds
  }
}

export function runPersonAgentCapsuleBackfill(input: {
  appPaths: AppPaths
  now?: string
  limit?: number
}) {
  const db = openDatabase(databasePath(input.appPaths))
  runMigrations(db)

  try {
    return backfillPersonAgentCapsules(db, input)
  } finally {
    db.close()
  }
}
