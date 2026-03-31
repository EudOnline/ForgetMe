import type {
  GroupPortraitSharedEvidenceSource,
  GroupPortraitSharedEvent
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'

export type PairwiseEdge = {
  leftPersonId: string
  rightPersonId: string
  sharedFileCount: number
  evidenceFileIds: string[]
  manualLabel: string | null
}

type SharedEventAccumulator = {
  eventId: string
  title: string
  timeStart: string
  timeEnd: string
  memberNamesById: Map<string, string>
  evidenceRefs: GroupPortraitSharedEvent['evidenceRefs']
}

export type GroupPortraitSharedEventWithMembers = GroupPortraitSharedEvent & {
  memberIds: string[]
}

function toEdgeKey(leftPersonId: string, rightPersonId: string) {
  return [leftPersonId, rightPersonId].sort((left, right) => left.localeCompare(right)).join('::')
}

function loadMemberFileRows(db: ArchiveDatabase, memberIds: string[]) {
  if (memberIds.length === 0) {
    return [] as Array<{ canonicalPersonId: string; fileId: string; fileName: string }>
  }

  const placeholders = memberIds.map(() => '?').join(', ')
  return db.prepare(
    `select
      pm.canonical_person_id as canonicalPersonId,
      r.target_id as fileId,
      vf.file_name as fileName
     from person_memberships pm
     join relations r
       on r.source_id = pm.anchor_person_id
      and r.source_type = 'person'
      and r.target_type = 'file'
      and r.relation_type = 'mentioned_in_file'
     join vault_files vf
       on vf.id = r.target_id
     where pm.status = 'active'
       and pm.canonical_person_id in (${placeholders})
     order by r.target_id asc, pm.canonical_person_id asc`
  ).all(...memberIds) as Array<{ canonicalPersonId: string; fileId: string; fileName: string }>
}

function loadManualRelationshipRows(db: ArchiveDatabase, memberIds: string[]) {
  if (memberIds.length === 0) {
    return [] as Array<{ fromPersonId: string; toPersonId: string; label: string }>
  }

  const placeholders = memberIds.map(() => '?').join(', ')
  return db.prepare(
    `select
      from_person_id as fromPersonId,
      to_person_id as toPersonId,
      label
     from canonical_relationship_labels
     where status = 'approved'
       and from_person_id in (${placeholders})
       and to_person_id in (${placeholders})`
  ).all(...memberIds, ...memberIds) as Array<{
    fromPersonId: string
    toPersonId: string
    label: string
  }>
}

export function buildPairwiseEdges(db: ArchiveDatabase, memberIds: string[]) {
  const rows = loadMemberFileRows(db, memberIds)
  const fileToMembers = new Map<string, string[]>()
  const edgeMap = new Map<string, PairwiseEdge>()

  for (const row of rows) {
    const members = fileToMembers.get(row.fileId) ?? []
    if (!members.includes(row.canonicalPersonId)) {
      members.push(row.canonicalPersonId)
    }
    fileToMembers.set(row.fileId, members)
  }

  for (const [fileId, fileMembers] of fileToMembers.entries()) {
    for (let index = 0; index < fileMembers.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < fileMembers.length; nextIndex += 1) {
        const leftPersonId = fileMembers[index]!
        const rightPersonId = fileMembers[nextIndex]!
        const key = toEdgeKey(leftPersonId, rightPersonId)
        const existing = edgeMap.get(key) ?? {
          leftPersonId: [leftPersonId, rightPersonId].sort((left, right) => left.localeCompare(right))[0]!,
          rightPersonId: [leftPersonId, rightPersonId].sort((left, right) => left.localeCompare(right))[1]!,
          sharedFileCount: 0,
          evidenceFileIds: [],
          manualLabel: null
        }

        existing.sharedFileCount += 1
        if (!existing.evidenceFileIds.includes(fileId)) {
          existing.evidenceFileIds.push(fileId)
        }
        edgeMap.set(key, existing)
      }
    }
  }

  for (const row of loadManualRelationshipRows(db, memberIds)) {
    const key = toEdgeKey(row.fromPersonId, row.toPersonId)
    const existing = edgeMap.get(key) ?? {
      leftPersonId: [row.fromPersonId, row.toPersonId].sort((left, right) => left.localeCompare(right))[0]!,
      rightPersonId: [row.fromPersonId, row.toPersonId].sort((left, right) => left.localeCompare(right))[1]!,
      sharedFileCount: 0,
      evidenceFileIds: [],
      manualLabel: null
    }
    existing.manualLabel = row.label
    edgeMap.set(key, existing)
  }

  return [...edgeMap.values()]
}

export function buildSharedEvidenceSources(
  db: ArchiveDatabase,
  memberIds: string[],
  memberNames: Map<string, string>
) {
  const rows = loadMemberFileRows(db, memberIds)
  const fileMap = new Map<string, { fileId: string; fileName: string; memberIds: string[] }>()

  for (const row of rows) {
    const existing = fileMap.get(row.fileId) ?? {
      fileId: row.fileId,
      fileName: row.fileName,
      memberIds: []
    }

    if (!existing.memberIds.includes(row.canonicalPersonId)) {
      existing.memberIds.push(row.canonicalPersonId)
    }

    fileMap.set(row.fileId, existing)
  }

  return [...fileMap.values()]
    .filter((file) => file.memberIds.length >= 2)
    .map((file) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      memberCount: file.memberIds.length,
      members: file.memberIds
        .map((memberId) => memberNames.get(memberId) ?? memberId)
        .sort((left, right) => left.localeCompare(right)),
      displayType: 'approved_fact' as const
    }))
    .sort((left, right) => {
      if (right.memberCount !== left.memberCount) {
        return right.memberCount - left.memberCount
      }
      const fileNameOrder = left.fileName.localeCompare(right.fileName)
      if (fileNameOrder !== 0) {
        return fileNameOrder
      }
      return left.fileId.localeCompare(right.fileId)
    }) satisfies GroupPortraitSharedEvidenceSource[]
}

export function loadSharedEvents(db: ArchiveDatabase, memberIds: string[]) {
  if (memberIds.length === 0) {
    return [] as GroupPortraitSharedEventWithMembers[]
  }

  const placeholders = memberIds.map(() => '?').join(', ')
  const rows = db.prepare(
    `select
      ec.id as eventId,
      ec.title as title,
      ec.time_start as timeStart,
      ec.time_end as timeEnd,
      ecm.canonical_person_id as memberId,
      cp.primary_display_name as memberName,
      vf.id as fileId,
      vf.file_name as fileName
     from event_clusters ec
     join event_cluster_members ecm
       on ecm.event_cluster_id = ec.id
     join canonical_people cp
       on cp.id = ecm.canonical_person_id
     left join event_cluster_evidence ece
       on ece.event_cluster_id = ec.id
     left join vault_files vf
       on vf.id = ece.file_id
     where ec.status = 'approved'
       and ecm.canonical_person_id in (${placeholders})
     order by ec.time_start asc, ec.id asc, cp.primary_display_name asc, vf.file_name asc`
  ).all(...memberIds) as Array<{
    eventId: string
    title: string
    timeStart: string
    timeEnd: string
    memberId: string
    memberName: string
    fileId: string | null
    fileName: string | null
  }>

  const eventMap = new Map<string, SharedEventAccumulator>()

  for (const row of rows) {
    const existing = eventMap.get(row.eventId) ?? {
      eventId: row.eventId,
      title: row.title,
      timeStart: row.timeStart,
      timeEnd: row.timeEnd,
      memberNamesById: new Map<string, string>(),
      evidenceRefs: []
    }

    existing.memberNamesById.set(row.memberId, row.memberName)
    if (row.fileId && row.fileName && !existing.evidenceRefs.some((ref) => ref.id === row.fileId)) {
      existing.evidenceRefs.push({
        kind: 'file',
        id: row.fileId,
        label: row.fileName
      })
    }
    eventMap.set(row.eventId, existing)
  }

  return [...eventMap.values()]
    .filter((event) => event.memberNamesById.size >= 2)
    .map((event) => ({
      eventId: event.eventId,
      title: event.title,
      timeStart: event.timeStart,
      timeEnd: event.timeEnd,
      memberCount: event.memberNamesById.size,
      members: Array.from(event.memberNamesById.values()).sort((left, right) => left.localeCompare(right)),
      memberIds: Array.from(event.memberNamesById.keys()).sort((left, right) => left.localeCompare(right)),
      evidenceRefs: event.evidenceRefs,
      displayType: 'approved_fact' as const
    }))
}
