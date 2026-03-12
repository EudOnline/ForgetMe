import path from 'node:path'
import type { AppPaths } from './appPaths'
import { openDatabase, runMigrations } from './db'
import { buildEnrichedSearchRow, loadApprovedEnrichmentIndex } from './enrichedSearchService'
import { searchDecisionJournal as searchDecisionJournalEntries } from './journalService'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

function extensionToKind(extension: string) {
  const normalized = extension.toLowerCase()
  if (['.json', '.txt'].includes(normalized)) return 'chat'
  if (['.jpg', '.jpeg', '.png', '.heic'].includes(normalized)) return 'image'
  return 'document'
}

export async function searchArchive(input: {
  appPaths: AppPaths
  query?: string
  fileKinds?: string[]
  batchId?: string
  duplicateClass?: string
  personName?: string
}) {
  const db = openDatabase(databasePath(input.appPaths))
  runMigrations(db)

  const rows = db.prepare(
    `select
      sfi.file_id as fileId,
      sfi.batch_id as batchId,
      sfi.file_name as fileName,
      sfi.extension as extension,
      sfi.duplicate_class as duplicateClass,
      sfi.parser_status as parserStatus,
      sfi.payload_json as payloadJson
    from search_file_index sfi
    where sfi.deleted_at is null`
  ).all() as Array<{
    fileId: string
    batchId: string
    fileName: string
    extension: string
    duplicateClass: string
    parserStatus: string
    payloadJson: string | null
  }>

  const peopleByFile = new Map<string, string[]>()
  const peopleRows = db.prepare(
    `select r.target_id as fileId, p.display_name as displayName
     from relations r
     join people p on p.id = r.source_id
     where r.source_type = 'person' and r.target_type = 'file'`
  ).all() as Array<{ fileId: string; displayName: string }>
  for (const row of peopleRows) {
    peopleByFile.set(row.fileId, [...(peopleByFile.get(row.fileId) ?? []), row.displayName])
  }

  const enrichmentByFile = loadApprovedEnrichmentIndex(db, {
    fileIds: rows.map((row) => row.fileId)
  })

  db.close()

  return rows
    .map((row) => {
      const fileKind = extensionToKind(row.extension)
      const enrichment = enrichmentByFile.get(row.fileId)
      const matchedPeople = peopleByFile.get(row.fileId) ?? []
      const haystack = buildEnrichedSearchRow({
        fileName: row.fileName,
        payloadJson: row.payloadJson,
        matchedPeople,
        enrichedTexts: enrichment?.enrichedTexts ?? [],
        approvedFields: enrichment?.approvedFields.map((field) => field.value) ?? []
      }).haystack
      return {
        ...row,
        fileKind,
        matchedPeople,
        haystack
      }
    })
    .filter((row) => (input.query ? row.haystack.toLowerCase().includes(input.query.toLowerCase()) : true))
    .filter((row) => (input.fileKinds?.length ? input.fileKinds.includes(row.fileKind) : true))
    .filter((row) => (input.batchId ? row.batchId === input.batchId : true))
    .filter((row) => (input.duplicateClass ? row.duplicateClass === input.duplicateClass : true))
    .filter((row) => (input.personName ? row.matchedPeople.some((name) => name.includes(input.personName!)) : true))
    .map(({ haystack, ...row }) => row)
}

export async function searchDecisionJournal(input: {
  appPaths: AppPaths
  query?: string
  decisionType?: string
  targetType?: string
}) {
  const db = openDatabase(databasePath(input.appPaths))
  runMigrations(db)

  try {
    return searchDecisionJournalEntries(db, {
      query: input.query,
      decisionType: input.decisionType,
      targetType: input.targetType
    })
  } finally {
    db.close()
  }
}
