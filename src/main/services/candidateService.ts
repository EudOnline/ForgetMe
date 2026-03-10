import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import { normalizePersonName } from './canonicalPeopleService'

export type PersonMergeCandidateInput = {
  canonicalPersonId: string
  displayName: string
  normalizedName?: string
  aliasDisplayNames?: string[]
}

export type PersonMergeCandidateDraft = {
  leftCanonicalPersonId: string
  rightCanonicalPersonId: string
  confidence: number
  matchedRules: string[]
  supportingEvidence: {
    normalizedName: string
    matchedDisplayNames: string[]
    aliasDisplayNames: string[]
  }
  status: 'pending'
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

export function buildPersonMergeCandidates(input: { people: PersonMergeCandidateInput[] }) {
  const peopleByNormalizedName = new Map<string, PersonMergeCandidateInput[]>()

  for (const person of input.people) {
    const normalizedName = person.normalizedName ?? normalizePersonName(person.displayName)
    if (!normalizedName) {
      continue
    }

    peopleByNormalizedName.set(normalizedName, [
      ...(peopleByNormalizedName.get(normalizedName) ?? []),
      { ...person, normalizedName }
    ])
  }

  const candidates = [] as PersonMergeCandidateDraft[]

  for (const [normalizedName, people] of peopleByNormalizedName) {
    const sortedPeople = people
      .slice()
      .sort((left, right) => left.canonicalPersonId.localeCompare(right.canonicalPersonId))

    for (let index = 0; index < sortedPeople.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < sortedPeople.length; compareIndex += 1) {
        const left = sortedPeople[index]
        const right = sortedPeople[compareIndex]

        if (left.canonicalPersonId === right.canonicalPersonId) {
          continue
        }

        candidates.push({
          leftCanonicalPersonId: left.canonicalPersonId,
          rightCanonicalPersonId: right.canonicalPersonId,
          confidence: 0.95,
          matchedRules: ['normalized_name_exact'],
          supportingEvidence: {
            normalizedName,
            matchedDisplayNames: uniqueValues([left.displayName, right.displayName]),
            aliasDisplayNames: uniqueValues([
              ...(left.aliasDisplayNames ?? []),
              ...(right.aliasDisplayNames ?? []),
              left.displayName,
              right.displayName
            ])
          },
          status: 'pending'
        })
      }
    }
  }

  return candidates
}

function loadCanonicalPeople(db: ArchiveDatabase) {
  const rows = db.prepare(
    `select
      cp.id as canonicalPersonId,
      cp.primary_display_name as displayName,
      cp.normalized_name as normalizedName,
      pa.display_name as aliasDisplayName
    from canonical_people cp
    left join person_aliases pa
      on pa.canonical_person_id = cp.id
    where cp.status = ?
    order by cp.id, pa.display_name`
  ).all('approved') as Array<{
    canonicalPersonId: string
    displayName: string
    normalizedName: string
    aliasDisplayName: string | null
  }>

  const people = new Map<string, PersonMergeCandidateInput>()

  for (const row of rows) {
    const existing = people.get(row.canonicalPersonId)
    if (existing) {
      if (row.aliasDisplayName) {
        existing.aliasDisplayNames = uniqueValues([...(existing.aliasDisplayNames ?? []), row.aliasDisplayName])
      }
      continue
    }

    people.set(row.canonicalPersonId, {
      canonicalPersonId: row.canonicalPersonId,
      displayName: row.displayName,
      normalizedName: row.normalizedName,
      aliasDisplayNames: row.aliasDisplayName ? [row.aliasDisplayName] : [row.displayName]
    })
  }

  return [...people.values()]
}

function persistPersonMergeCandidates(db: ArchiveDatabase, candidates: PersonMergeCandidateDraft[]) {
  const createdAt = new Date().toISOString()
  const findExistingCandidate = db.prepare(
    `select id from person_merge_candidates
     where (
       (left_canonical_person_id = ? and right_canonical_person_id = ?)
       or
       (left_canonical_person_id = ? and right_canonical_person_id = ?)
     ) and status in ('pending', 'approved')
     limit 1`
  )
  const insertCandidate = db.prepare(
    `insert into person_merge_candidates (
      id, left_canonical_person_id, right_canonical_person_id, confidence,
      matched_rules_json, supporting_evidence_json, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertReviewQueue = db.prepare(
    `insert into review_queue (
      id, item_type, candidate_id, status, priority, confidence, summary_json, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const persisted = [] as Array<PersonMergeCandidateDraft & { candidateId: string; reviewQueueId: string; createdAt: string }>

  for (const candidate of candidates) {
    const existing = findExistingCandidate.get(
      candidate.leftCanonicalPersonId,
      candidate.rightCanonicalPersonId,
      candidate.rightCanonicalPersonId,
      candidate.leftCanonicalPersonId
    ) as { id: string } | undefined

    if (existing) {
      continue
    }

    const candidateId = crypto.randomUUID()
    const reviewQueueId = crypto.randomUUID()

    insertCandidate.run(
      candidateId,
      candidate.leftCanonicalPersonId,
      candidate.rightCanonicalPersonId,
      candidate.confidence,
      JSON.stringify(candidate.matchedRules),
      JSON.stringify(candidate.supportingEvidence),
      candidate.status,
      createdAt
    )

    insertReviewQueue.run(
      reviewQueueId,
      'person_merge_candidate',
      candidateId,
      'pending',
      0,
      candidate.confidence,
      JSON.stringify({
        matchedRules: candidate.matchedRules,
        normalizedName: candidate.supportingEvidence.normalizedName,
        matchedDisplayNames: candidate.supportingEvidence.matchedDisplayNames
      }),
      createdAt
    )

    persisted.push({
      ...candidate,
      candidateId,
      reviewQueueId,
      createdAt
    })
  }

  return persisted
}

export function generatePersonMergeCandidates(db: ArchiveDatabase) {
  return persistPersonMergeCandidates(
    db,
    buildPersonMergeCandidates({
      people: loadCanonicalPeople(db)
    })
  )
}
