import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'

export type CanonicalAliasInput = {
  anchorPersonId?: string
  displayName: string
  sourceType: string
  confidence: number
  firstSeenAt?: string | null
  lastSeenAt?: string | null
}

export function normalizePersonName(displayName: string) {
  return displayName.trim().replace(/\s+/g, ' ').toLowerCase()
}

function displayNameQuality(displayName: string) {
  const trimmed = displayName.trim()
  const hasUppercase = /[A-Z]/.test(trimmed)
  const hasLowercase = /[a-z]/.test(trimmed)
  const startsUppercase = /^[A-Z]/.test(trimmed)
  return Number(hasUppercase && hasLowercase) * 3 + Number(startsUppercase)
}

export function chooseCanonicalPersonName(aliases: CanonicalAliasInput[]) {
  return aliases
    .slice()
    .sort((left, right) => {
      const manualBoost = Number(right.sourceType === 'manual') - Number(left.sourceType === 'manual')
      if (manualBoost !== 0) {
        return manualBoost
      }
      const qualityBoost = displayNameQuality(right.displayName) - displayNameQuality(left.displayName)
      if (qualityBoost !== 0) {
        return qualityBoost
      }
      const lengthBoost = right.displayName.length - left.displayName.length
      if (lengthBoost !== 0) {
        return lengthBoost
      }
      return right.confidence - left.confidence
    })[0]?.displayName ?? 'Unknown Person'
}

export function ensureCanonicalPeopleForAnchors(db: ArchiveDatabase, anchors: CanonicalAliasInput[]) {
  const createdAt = new Date().toISOString()
  const insertCanonical = db.prepare(
    `insert into canonical_people (
      id, primary_display_name, normalized_name, alias_count, first_seen_at, last_seen_at,
      evidence_count, manual_labels_json, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertAlias = db.prepare(
    `insert into person_aliases (
      id, canonical_person_id, anchor_person_id, display_name, normalized_name, source_type, confidence, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertMembership = db.prepare(
    `insert into person_memberships (
      id, canonical_person_id, anchor_person_id, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?)`
  )
  const membershipLookup = db.prepare(
    'select canonical_person_id as canonicalPersonId from person_memberships where anchor_person_id = ? and status = ?'
  )

  return anchors.map((anchor) => {
    const existing = anchor.anchorPersonId
      ? membershipLookup.get(anchor.anchorPersonId, 'active') as { canonicalPersonId: string } | undefined
      : undefined

    if (existing) {
      return {
        canonicalPersonId: existing.canonicalPersonId,
        anchorPersonId: anchor.anchorPersonId ?? null,
        displayName: anchor.displayName
      }
    }

    const canonicalPersonId = crypto.randomUUID()
    const normalizedName = normalizePersonName(chooseCanonicalPersonName([anchor]))

    insertCanonical.run(
      canonicalPersonId,
      chooseCanonicalPersonName([anchor]),
      normalizedName,
      1,
      anchor.firstSeenAt ?? createdAt,
      anchor.lastSeenAt ?? createdAt,
      1,
      '[]',
      'approved',
      createdAt,
      createdAt
    )

    insertAlias.run(
      crypto.randomUUID(),
      canonicalPersonId,
      anchor.anchorPersonId ?? null,
      anchor.displayName,
      normalizePersonName(anchor.displayName),
      anchor.sourceType,
      anchor.confidence,
      createdAt
    )

    if (anchor.anchorPersonId) {
      insertMembership.run(
        crypto.randomUUID(),
        canonicalPersonId,
        anchor.anchorPersonId,
        'active',
        createdAt,
        createdAt
      )
    }

    return {
      canonicalPersonId,
      anchorPersonId: anchor.anchorPersonId ?? null,
      displayName: anchor.displayName
    }
  })
}
