import type { MemoryWorkspaceCommunicationExcerpt } from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { getGroupPortrait } from './groupPortraitService'

const QUOTE_INTENT_KEYWORDS = [
  '原话',
  '原文',
  'quote',
  'quotes',
  '摘录',
  '引用',
  '怎么表达',
  '怎么说',
  '说过',
  '措辞'
] as const

const QUESTION_NOISE_PHRASES = [
  '给我看',
  '相关',
  '这类事',
  '这件事',
  '过去',
  '曾经',
  '以前',
  '她',
  '他',
  '大家',
  '这个群体',
  '怎么',
  '如何',
  '表达',
  '说',
  '原话',
  '原文',
  '摘录',
  '引用',
  'quote',
  'quotes',
  '请'
] as const

type CommunicationEvidenceRow = MemoryWorkspaceCommunicationExcerpt & {
  speakerAnchorPersonId: string | null
}

function normalizeText(input: string) {
  return input.trim().toLowerCase()
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const value of values) {
    if (seen.has(value)) {
      continue
    }

    seen.add(value)
    deduped.push(value)
  }

  return deduped
}

function expandToken(token: string) {
  const normalized = normalizeText(token)
  if (normalized.length < 2) {
    return [] as string[]
  }

  if (/^[\u3400-\u9fff]+$/u.test(normalized) && normalized.length > 2) {
    const fragments = [normalized]
    for (let index = 0; index < normalized.length - 1; index += 1) {
      fragments.push(normalized.slice(index, index + 2))
    }
    return dedupeStrings(fragments.filter((fragment) => fragment.length >= 2))
  }

  return [normalized]
}

function extractQueryTerms(question: string) {
  let stripped = normalizeText(question)
  const phrases = [...QUOTE_INTENT_KEYWORDS, ...QUESTION_NOISE_PHRASES].sort((left, right) => right.length - left.length)

  for (const phrase of phrases) {
    stripped = stripped.split(phrase).join(' ')
  }

  stripped = stripped
    .replace(/[，。！？、,.!?;:()[\]{}"'“”‘’/\\_-]+/g, ' ')
    .replace(/和|与|及|以及|and|or|about|有关|一下|一下子|的|了|吗|呢|吧/g, ' ')

  return dedupeStrings(
    stripped
      .split(/\s+/)
      .flatMap((token) => expandToken(token))
      .filter((token) => token.length >= 2)
  )
}

function scoreRow(row: CommunicationEvidenceRow, queryTerms: string[]) {
  const haystack = [
    row.text,
    row.fileName,
    row.speakerDisplayName ?? ''
  ].map(normalizeText).join(' ')

  const matchedTerms = new Set<string>()

  for (const term of queryTerms) {
    if (haystack.includes(term)) {
      matchedTerms.add(term)
    }
  }

  if (matchedTerms.size === 0) {
    return 0
  }

  return Array.from(matchedTerms).reduce((score, term) => score + (term.length >= 3 ? 3 : 2), matchedTerms.size * 10)
}

function rankRows(rows: CommunicationEvidenceRow[], question: string | undefined, limit: number) {
  const cleanedRows = rows.filter((row) => normalizeText(row.text).length > 0)
  if (cleanedRows.length === 0) {
    return [] as MemoryWorkspaceCommunicationExcerpt[]
  }

  const queryTerms = question ? extractQueryTerms(question) : []
  if (queryTerms.length === 0) {
    return cleanedRows.slice(0, limit).map(({ speakerAnchorPersonId: _speakerAnchorPersonId, ...excerpt }) => excerpt)
  }

  return cleanedRows
    .map((row) => ({
      row,
      score: scoreRow(row, queryTerms)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || left.row.fileId.localeCompare(right.row.fileId)
      || left.row.ordinal - right.row.ordinal
      || left.row.excerptId.localeCompare(right.row.excerptId)
    ))
    .slice(0, limit)
    .map(({ row }) => {
      const { speakerAnchorPersonId: _speakerAnchorPersonId, ...excerpt } = row
      return excerpt
    })
}

function listActiveAnchorIds(db: ArchiveDatabase, canonicalPersonIds: string[]) {
  if (canonicalPersonIds.length === 0) {
    return [] as string[]
  }

  const placeholders = canonicalPersonIds.map(() => '?').join(', ')
  const rows = db.prepare(
    `select distinct anchor_person_id as anchorPersonId
     from person_memberships
     where status = 'active'
       and canonical_person_id in (${placeholders})
     order by anchor_person_id asc`
  ).all(...canonicalPersonIds) as Array<{ anchorPersonId: string }>

  return rows.map((row) => row.anchorPersonId)
}

function listRowsForGlobalScope(db: ArchiveDatabase) {
  return db.prepare(
    `select
      ce.id as excerptId,
      ce.file_id as fileId,
      vf.file_name as fileName,
      ce.ordinal as ordinal,
      ce.speaker_display_name as speakerDisplayName,
      ce.speaker_anchor_person_id as speakerAnchorPersonId,
      ce.excerpt_text as text
     from communication_evidence ce
     join vault_files vf
       on vf.id = ce.file_id
     order by ce.file_id asc, ce.ordinal asc, ce.id asc`
  ).all() as CommunicationEvidenceRow[]
}

function listRowsForPersonScope(db: ArchiveDatabase, canonicalPersonId: string) {
  return db.prepare(
    `select
      ce.id as excerptId,
      ce.file_id as fileId,
      vf.file_name as fileName,
      ce.ordinal as ordinal,
      ce.speaker_display_name as speakerDisplayName,
      ce.speaker_anchor_person_id as speakerAnchorPersonId,
      ce.excerpt_text as text
     from communication_evidence ce
     join vault_files vf
       on vf.id = ce.file_id
     join person_memberships pm
       on pm.anchor_person_id = ce.speaker_anchor_person_id
      and pm.status = 'active'
     where pm.canonical_person_id = ?
     order by ce.file_id asc, ce.ordinal asc, ce.id asc`
  ).all(canonicalPersonId) as CommunicationEvidenceRow[]
}

function listRowsForGroupScope(db: ArchiveDatabase, anchorPersonId: string) {
  const portrait = getGroupPortrait(db, { canonicalPersonId: anchorPersonId })
  if (!portrait) {
    return [] as CommunicationEvidenceRow[]
  }

  const sharedFileIds = dedupeStrings([
    ...portrait.sharedEvidenceSources.map((source) => source.fileId),
    ...portrait.sharedEvents.flatMap((event) => event.evidenceRefs
      .filter((ref) => ref.kind === 'file')
      .map((ref) => ref.id))
  ]).sort((left, right) => left.localeCompare(right))

  if (sharedFileIds.length === 0) {
    return [] as CommunicationEvidenceRow[]
  }

  const memberAnchorIds = listActiveAnchorIds(
    db,
    portrait.members.map((member) => member.personId)
  )
  const filePlaceholders = sharedFileIds.map(() => '?').join(', ')
  const speakerFilter = memberAnchorIds.length > 0
    ? ` and (ce.speaker_anchor_person_id in (${memberAnchorIds.map(() => '?').join(', ')}) or ce.speaker_anchor_person_id is null)`
    : ''

  return db.prepare(
    `select
      ce.id as excerptId,
      ce.file_id as fileId,
      vf.file_name as fileName,
      ce.ordinal as ordinal,
      ce.speaker_display_name as speakerDisplayName,
      ce.speaker_anchor_person_id as speakerAnchorPersonId,
      ce.excerpt_text as text
     from communication_evidence ce
     join vault_files vf
       on vf.id = ce.file_id
     where ce.file_id in (${filePlaceholders})${speakerFilter}
     order by ce.file_id asc, ce.ordinal asc, ce.id asc`
  ).all(...sharedFileIds, ...memberAnchorIds) as CommunicationEvidenceRow[]
}

export function isCommunicationEvidenceQuestion(question: string) {
  const normalizedQuestion = normalizeText(question)
  return QUOTE_INTENT_KEYWORDS.some((keyword) => normalizedQuestion.includes(keyword))
}

export function listGlobalCommunicationEvidence(
  db: ArchiveDatabase,
  input: {
    question?: string
    limit?: number
  } = {}
) {
  return rankRows(listRowsForGlobalScope(db), input.question, input.limit ?? 3)
}

export function listPersonCommunicationEvidence(
  db: ArchiveDatabase,
  input: {
    canonicalPersonId: string
    question?: string
    limit?: number
  }
) {
  return rankRows(listRowsForPersonScope(db, input.canonicalPersonId), input.question, input.limit ?? 3)
}

export function listGroupCommunicationEvidence(
  db: ArchiveDatabase,
  input: {
    anchorPersonId: string
    question?: string
    limit?: number
  }
) {
  return rankRows(listRowsForGroupScope(db, input.anchorPersonId), input.question, input.limit ?? 3)
}
