import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'

function loadApprovedPeople(db: ArchiveDatabase, ids: string[]) {
  if (ids.length === 0) {
    return [] as Array<{ id: string; primaryDisplayName: string }>
  }

  const placeholders = ids.map(() => '?').join(', ')
  return db.prepare(
    `select id, primary_display_name as primaryDisplayName
     from canonical_people
     where status = 'approved' and id in (${placeholders})
     order by id asc`
  ).all(...ids) as Array<{ id: string; primaryDisplayName: string }>
}

export function setRelationshipLabel(db: ArchiveDatabase, input: { fromPersonId: string; toPersonId: string; label: string }) {
  const existing = db.prepare(
    `select id from canonical_relationship_labels
     where from_person_id = ? and to_person_id = ?`
  ).get(input.fromPersonId, input.toPersonId) as { id: string } | undefined
  const updatedAt = new Date().toISOString()

  if (existing) {
    db.prepare(
      'update canonical_relationship_labels set label = ?, status = ?, updated_at = ? where id = ?'
    ).run(input.label, 'approved', updatedAt, existing.id)
    return { id: existing.id, status: 'approved' as const }
  }

  const labelId = crypto.randomUUID()
  db.prepare(
    `insert into canonical_relationship_labels (
      id, from_person_id, to_person_id, label, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?)`
  ).run(labelId, input.fromPersonId, input.toPersonId, input.label, 'approved', updatedAt, updatedAt)

  return { id: labelId, status: 'approved' as const }
}

export function getPersonGraph(db: ArchiveDatabase, input: { canonicalPersonId: string }) {
  const anchorRows = db.prepare(
    `select anchor_person_id as anchorPersonId
     from person_memberships
     where canonical_person_id = ? and status = ?`
  ).all(input.canonicalPersonId, 'active') as Array<{ anchorPersonId: string }>

  const fileIds = anchorRows.length > 0
    ? (db.prepare(
      `select distinct target_id as fileId
       from relations
       where source_type = 'person' and target_type = 'file' and relation_type = 'mentioned_in_file'
         and source_id in (${anchorRows.map(() => '?').join(', ')})`
    ).all(...anchorRows.map((row) => row.anchorPersonId)) as Array<{ fileId: string }>).map((row) => row.fileId)
    : []

  const evidenceRows = fileIds.length > 0
    ? db.prepare(
      `select
        pm.canonical_person_id as canonicalPersonId,
        r.target_id as fileId
       from relations r
       join person_memberships pm
         on pm.anchor_person_id = r.source_id
        and pm.status = 'active'
       join canonical_people cp
         on cp.id = pm.canonical_person_id
        and cp.status = 'approved'
       where r.source_type = 'person'
         and r.target_type = 'file'
         and r.relation_type = 'mentioned_in_file'
         and r.target_id in (${fileIds.map(() => '?').join(', ')})
         and pm.canonical_person_id != ?`
    ).all(...fileIds, input.canonicalPersonId) as Array<{ canonicalPersonId: string; fileId: string }>
    : []

  const edgeMap = new Map<string, {
    fromPersonId: string
    toPersonId: string
    status: 'approved'
    sharedFileCount: number
    evidenceFileIds: string[]
    manualLabel?: string
  }>()

  for (const row of evidenceRows) {
    const key = `${input.canonicalPersonId}:${row.canonicalPersonId}`
    const existing = edgeMap.get(key) ?? {
      fromPersonId: input.canonicalPersonId,
      toPersonId: row.canonicalPersonId,
      status: 'approved' as const,
      sharedFileCount: 0,
      evidenceFileIds: [] as string[]
    }
    if (!existing.evidenceFileIds.includes(row.fileId)) {
      existing.evidenceFileIds.push(row.fileId)
      existing.sharedFileCount += 1
    }
    edgeMap.set(key, existing)
  }

  const manualLabelRows = db.prepare(
    `select
      from_person_id as fromPersonId,
      to_person_id as toPersonId,
      label
     from canonical_relationship_labels
     where status = ? and (from_person_id = ? or to_person_id = ?)`
  ).all('approved', input.canonicalPersonId, input.canonicalPersonId) as Array<{
    fromPersonId: string
    toPersonId: string
    label: string
  }>

  for (const row of manualLabelRows) {
    const counterpartId = row.fromPersonId === input.canonicalPersonId ? row.toPersonId : row.fromPersonId
    const key = `${input.canonicalPersonId}:${counterpartId}`
    const existing = edgeMap.get(key) ?? {
      fromPersonId: input.canonicalPersonId,
      toPersonId: counterpartId,
      status: 'approved' as const,
      sharedFileCount: 0,
      evidenceFileIds: [] as string[]
    }
    existing.manualLabel = row.label
    edgeMap.set(key, existing)
  }

  const nodeIds = [input.canonicalPersonId, ...new Set([...edgeMap.values()].map((edge) => edge.toPersonId))]
  const nodes = loadApprovedPeople(db, nodeIds)

  return {
    nodes,
    edges: [...edgeMap.values()].filter((edge) => nodes.some((node) => node.id === edge.toPersonId))
  }
}
