import type { ArchiveDatabase } from './db'
import { loadApprovedEnrichmentIndex } from './enrichedSearchService'
import { getApprovedProfileByCanonicalPerson } from './profileReadService'

function getCanonicalPersonFileIds(db: ArchiveDatabase, canonicalPersonId: string) {
  const anchorRows = db.prepare(
    `select anchor_person_id as anchorPersonId
     from person_memberships
     where canonical_person_id = ? and status = ?`
  ).all(canonicalPersonId, 'active') as Array<{ anchorPersonId: string }>

  if (anchorRows.length === 0) {
    return [] as string[]
  }

  const fileRows = db.prepare(
    `select distinct target_id as fileId
     from relations
     where source_type = 'person'
       and target_type = 'file'
       and source_id in (${anchorRows.map(() => '?').join(', ')})
     order by target_id asc`
  ).all(...anchorRows.map((row) => row.anchorPersonId)) as Array<{ fileId: string }>

  return fileRows.map((row) => row.fileId)
}

export function getPeopleList(db: ArchiveDatabase) {
  const rows = db.prepare(
    `select
      cp.id as id,
      cp.primary_display_name as primaryDisplayName,
      cp.normalized_name as normalizedName,
      cp.alias_count as aliasCount,
      cp.first_seen_at as firstSeenAt,
      cp.last_seen_at as lastSeenAt,
      cp.status as status,
      (
        select count(*)
        from person_memberships pm
        where pm.canonical_person_id = cp.id and pm.status = 'active'
      ) as evidenceCount
    from canonical_people cp
    where cp.status = ?
    order by cp.primary_display_name asc`
  ).all('approved') as Array<{
    id: string
    primaryDisplayName: string
    normalizedName: string
    aliasCount: number
    firstSeenAt: string | null
    lastSeenAt: string | null
    status: string
    evidenceCount: number
  }>

  return rows
}

export function getCanonicalPerson(db: ArchiveDatabase, input: { canonicalPersonId: string }) {
  const person = db.prepare(
    `select
      id,
      primary_display_name as primaryDisplayName,
      normalized_name as normalizedName,
      alias_count as aliasCount,
      first_seen_at as firstSeenAt,
      last_seen_at as lastSeenAt,
      evidence_count as storedEvidenceCount,
      manual_labels_json as manualLabelsJson,
      status
    from canonical_people
    where id = ? and status = ?`
  ).get(input.canonicalPersonId, 'approved') as {
    id: string
    primaryDisplayName: string
    normalizedName: string
    aliasCount: number
    firstSeenAt: string | null
    lastSeenAt: string | null
    storedEvidenceCount: number
    manualLabelsJson: string
    status: string
  } | undefined

  if (!person) {
    return null
  }

  const aliases = db.prepare(
    `select display_name as displayName, source_type as sourceType, confidence
     from person_aliases
     where canonical_person_id = ?
     order by display_name asc`
  ).all(input.canonicalPersonId) as Array<{
    displayName: string
    sourceType: string
    confidence: number
  }>
  const evidenceCount = db.prepare(
    `select count(*) as count
     from person_memberships
     where canonical_person_id = ? and status = ?`
  ).get(input.canonicalPersonId, 'active') as { count: number }
  const fileIds = getCanonicalPersonFileIds(db, input.canonicalPersonId)
  const enrichmentByFile = loadApprovedEnrichmentIndex(db, { fileIds })
  const approvedFields = fileIds.flatMap((fileId) => enrichmentByFile.get(fileId)?.approvedFields ?? [])

  return {
    id: person.id,
    primaryDisplayName: person.primaryDisplayName,
    normalizedName: person.normalizedName,
    aliasCount: person.aliasCount,
    firstSeenAt: person.firstSeenAt,
    lastSeenAt: person.lastSeenAt,
    evidenceCount: evidenceCount.count,
    manualLabels: JSON.parse(person.manualLabelsJson),
    aliases,
    approvedFields,
    approvedProfile: getApprovedProfileByCanonicalPerson(db, { canonicalPersonId: input.canonicalPersonId }),
    status: person.status
  }
}

export function getPersonTimeline(db: ArchiveDatabase, input: { canonicalPersonId: string }) {
  const rows = db.prepare(
    `select
      ec.id as eventId,
      ec.title as title,
      ec.time_start as timeStart,
      ec.time_end as timeEnd,
      ec.summary as summary,
      vf.id as fileId,
      vf.batch_id as batchId,
      vf.file_name as fileName,
      vf.extension as extension
    from event_clusters ec
    join event_cluster_members ecm
      on ecm.event_cluster_id = ec.id
    left join event_cluster_evidence ece
      on ece.event_cluster_id = ec.id
    left join vault_files vf
      on vf.id = ece.file_id
    where ec.status = ? and ecm.canonical_person_id = ?
    order by ec.time_start asc, vf.file_name asc`
  ).all('approved', input.canonicalPersonId) as Array<{
    eventId: string
    title: string
    timeStart: string
    timeEnd: string
    summary: string | null
    fileId: string | null
    batchId: string | null
    fileName: string | null
    extension: string | null
  }>

  const enrichmentByFile = loadApprovedEnrichmentIndex(db, {
    fileIds: rows.flatMap((row) => row.fileId ?? [])
  })

  const timeline = new Map<string, {
    eventId: string
    title: string
    timeStart: string
    timeEnd: string
    summary: string | null
    evidence: Array<{
      fileId: string
      batchId: string | null
      fileName: string
      extension: string | null
      enrichmentSignals: string[]
    }>
  }>()

  for (const row of rows) {
    const existing = timeline.get(row.eventId) ?? {
      eventId: row.eventId,
      title: row.title,
      timeStart: row.timeStart,
      timeEnd: row.timeEnd,
      summary: row.summary,
      evidence: []
    }

    if (row.fileId && row.fileName) {
      existing.evidence.push({
        fileId: row.fileId,
        batchId: row.batchId,
        fileName: row.fileName,
        extension: row.extension,
        enrichmentSignals: enrichmentByFile.get(row.fileId)?.timelineSignals ?? []
      })
    }

    timeline.set(row.eventId, existing)
  }

  return [...timeline.values()]
}
