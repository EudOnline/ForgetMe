import crypto from 'node:crypto'
import { URL } from 'node:url'
import type {
  ApprovedDraftHostedShareHostStatus,
  ApprovedPersonaDraftHostedShareLinkRecord,
  CreateApprovedPersonaDraftHostedShareLinkResult,
  RevokeApprovedPersonaDraftHostedShareLinkResult
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { appendDecisionJournal, listDecisionJournal } from './journalService'
import {
  listApprovedPersonaDraftPublications,
  readApprovedDraftPublicationPackage
} from './approvedDraftPublicationService'

const LOCAL_ACTOR = 'local-user'
const HOST_KIND = 'configured_remote_host' as const

type ConfiguredHostConfig = {
  availability: 'configured'
  hostKind: typeof HOST_KIND
  hostLabel: string
  baseUrl: string
  token: string
}

type UnconfiguredHostConfig = {
  availability: 'unconfigured'
  hostKind: null
  hostLabel: null
}

type HostConfig = ConfiguredHostConfig | UnconfiguredHostConfig

type HostedShareLinkJournalPayload = {
  shareLinkId: string
  publicationId: string
  draftReviewId: string
  sourceTurnId: string
  hostKind: typeof HOST_KIND
  hostLabel: string
  remoteShareId: string
  shareUrl: string
  publicArtifactSha256: string
}

type HostedShareLinkReadModel = HostedShareLinkJournalPayload & {
  createdAt: string
  revokedAt: string | null
}

function readNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function currentHostedShareHostConfig(): HostConfig {
  const baseUrl = process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_BASE_URL?.trim() ?? ''
  const token = process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_TOKEN?.trim() ?? ''
  if (!baseUrl || !token) {
    return {
      availability: 'unconfigured',
      hostKind: null,
      hostLabel: null
    }
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  return {
    availability: 'configured',
    hostKind: HOST_KIND,
    hostLabel: new URL(normalizedBaseUrl).origin,
    baseUrl: normalizedBaseUrl,
    token
  }
}

export function getApprovedDraftHostedShareHostStatus(): ApprovedDraftHostedShareHostStatus {
  const config = currentHostedShareHostConfig()
  if (config.availability === 'configured') {
    return {
      availability: 'configured',
      hostKind: config.hostKind,
      hostLabel: config.hostLabel
    }
  }

  return {
    availability: 'unconfigured',
    hostKind: null,
    hostLabel: null
  }
}

function sha256Json(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function persistShareHostArtifact(db: ArchiveDatabase, input: {
  shareLinkId: string
  draftReviewId: string
  publicationId: string
  sourceTurnId: string
  operationKind: 'create' | 'revoke'
  hostKind: typeof HOST_KIND
  hostLabel: string
  requestHash: string
  createdAt?: string
}) {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const artifactId = crypto.randomUUID()

  db.prepare(`insert into persona_draft_share_host_artifacts (
    id, share_link_id, draft_review_id, publication_id, source_turn_id, operation_kind, host_kind, host_label, request_hash, created_at
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    artifactId,
    input.shareLinkId,
    input.draftReviewId,
    input.publicationId,
    input.sourceTurnId,
    input.operationKind,
    input.hostKind,
    input.hostLabel,
    input.requestHash,
    createdAt
  )

  return { artifactId, createdAt }
}

function persistShareHostEvent(db: ArchiveDatabase, input: {
  artifactId: string
  eventType: 'request' | 'response' | 'error'
  payload: Record<string, unknown>
  createdAt?: string
}) {
  const createdAt = input.createdAt ?? new Date().toISOString()

  db.prepare(`insert into persona_draft_share_host_events (
    id, artifact_id, event_type, payload_json, created_at
  ) values (?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(),
    input.artifactId,
    input.eventType,
    JSON.stringify(input.payload),
    createdAt
  )
}

async function callHost(input: {
  url: string
  token: string
  payload: Record<string, unknown>
}) {
  const response = await fetch(input.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.token}`
    },
    body: JSON.stringify(input.payload)
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`host returned ${response.status}: ${text}`)
  }

  return response.json() as Promise<Record<string, unknown>>
}

function readHostedShareLinkPayload(payload: Record<string, unknown>): HostedShareLinkJournalPayload | null {
  const shareLinkId = readNonEmptyString(payload.shareLinkId)
  const publicationId = readNonEmptyString(payload.publicationId)
  const draftReviewId = readNonEmptyString(payload.draftReviewId)
  const sourceTurnId = readNonEmptyString(payload.sourceTurnId)
  const hostLabel = readNonEmptyString(payload.hostLabel)
  const remoteShareId = readNonEmptyString(payload.remoteShareId)
  const shareUrl = readNonEmptyString(payload.shareUrl)
  const publicArtifactSha256 = readNonEmptyString(payload.publicArtifactSha256)

  if (
    !shareLinkId
    || !publicationId
    || !draftReviewId
    || !sourceTurnId
    || payload.hostKind !== HOST_KIND
    || !hostLabel
    || !remoteShareId
    || !shareUrl
    || !publicArtifactSha256
  ) {
    return null
  }

  return {
    shareLinkId,
    publicationId,
    draftReviewId,
    sourceTurnId,
    hostKind: HOST_KIND,
    hostLabel,
    remoteShareId,
    shareUrl,
    publicArtifactSha256
  }
}

function toHostedShareLinkRecord(readModel: HostedShareLinkReadModel): ApprovedPersonaDraftHostedShareLinkRecord {
  if (readModel.revokedAt) {
    return {
      ...readModel,
      status: 'revoked',
      revokedAt: readModel.revokedAt
    }
  }

  return {
    ...readModel,
    status: 'active',
    revokedAt: null
  }
}

function findHostedShareLinkRecord(
  db: ArchiveDatabase,
  shareLinkId: string
): ApprovedPersonaDraftHostedShareLinkRecord | null {
  return listApprovedPersonaDraftHostedShareLinks(db, {}).find((link) => link.shareLinkId === shareLinkId) ?? null
}

export function listApprovedPersonaDraftHostedShareLinks(
  db: ArchiveDatabase,
  input: { draftReviewId?: string }
): ApprovedPersonaDraftHostedShareLinkRecord[] {
  const entries = listDecisionJournal(db, { targetType: 'persona_draft_review' })
    .filter((entry) =>
      (entry.decisionType === 'create_approved_persona_draft_share_link'
        || entry.decisionType === 'revoke_approved_persona_draft_share_link')
      && (!input.draftReviewId || entry.targetId === input.draftReviewId)
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const links = new Map<string, HostedShareLinkReadModel>()

  for (const entry of entries) {
    const payload = readHostedShareLinkPayload(entry.operationPayload)
    if (!payload) {
      continue
    }

    if (entry.decisionType === 'create_approved_persona_draft_share_link') {
      links.set(payload.shareLinkId, {
        ...payload,
        createdAt: entry.createdAt,
        revokedAt: null
      })
      continue
    }

    const existing = links.get(payload.shareLinkId)
    if (!existing) {
      continue
    }

    links.set(payload.shareLinkId, {
      ...existing,
      revokedAt: entry.createdAt
    })
  }

  return Array.from(links.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toHostedShareLinkRecord)
}

export async function createApprovedPersonaDraftHostedShareLink(
  db: ArchiveDatabase,
  input: { draftReviewId: string }
): Promise<CreateApprovedPersonaDraftHostedShareLinkResult | null> {
  const config = currentHostedShareHostConfig()
  if (config.availability === 'unconfigured') {
    return null
  }

  const reviewRow = db.prepare(
    `select id, status, source_turn_id as sourceTurnId from persona_draft_reviews where id = ?`
  ).get(input.draftReviewId) as { id: string; status: string; sourceTurnId: string } | undefined

  if (!reviewRow || reviewRow.status !== 'approved') {
    return null
  }

  const publication = listApprovedPersonaDraftPublications(db, { draftReviewId: input.draftReviewId })[0]
  if (!publication) {
    return null
  }

  const packageData = readApprovedDraftPublicationPackage(publication)
  if (!packageData) {
    return null
  }

  const shareLinkId = crypto.randomUUID()
  const requestEnvelope = {
    requestShape: 'approved_draft_hosted_share_link_create' as const,
    shareLinkId,
    publicationId: publication.publicationId,
    draftReviewId: publication.draftReviewId,
    sourceTurnId: publication.sourceTurnId,
    publicArtifactSha256: publication.publicArtifactSha256,
    manifest: packageData.manifest,
    publication: packageData.publication,
    displayEntry: {
      fileName: publication.displayEntryFileName,
      html: packageData.displayEntryHtml
    },
    displayStyles: {
      fileName: 'styles.css',
      css: packageData.displayStylesCss
    }
  }
  const requestHash = sha256Json(requestEnvelope)
  const { artifactId } = persistShareHostArtifact(db, {
    shareLinkId,
    draftReviewId: publication.draftReviewId,
    publicationId: publication.publicationId,
    sourceTurnId: publication.sourceTurnId,
    operationKind: 'create',
    hostKind: HOST_KIND,
    hostLabel: config.hostLabel,
    requestHash
  })

  persistShareHostEvent(db, {
    artifactId,
    eventType: 'request',
    payload: requestEnvelope
  })

  let responseBody: Record<string, unknown>
  try {
    responseBody = await callHost({
      url: new URL('/api/approved-draft-share-links', config.baseUrl).toString(),
      token: config.token,
      payload: requestEnvelope
    })
  } catch (error) {
    persistShareHostEvent(db, {
      artifactId,
      eventType: 'error',
      payload: { message: (error as Error).message }
    })
    throw error
  }

  persistShareHostEvent(db, {
    artifactId,
    eventType: 'response',
    payload: responseBody
  })

  const remoteShareId = readNonEmptyString(responseBody.remoteShareId)
  const shareUrl = readNonEmptyString(responseBody.shareUrl)
  if (!remoteShareId || !shareUrl) {
    const error = new Error('host returned invalid create response')
    persistShareHostEvent(db, {
      artifactId,
      eventType: 'error',
      payload: { message: error.message }
    })
    throw error
  }

  appendDecisionJournal(db, {
    decisionType: 'create_approved_persona_draft_share_link',
    targetType: 'persona_draft_review',
    targetId: publication.draftReviewId,
    operationPayload: {
      shareLinkId,
      draftReviewId: publication.draftReviewId,
      publicationId: publication.publicationId,
      sourceTurnId: publication.sourceTurnId,
      hostKind: HOST_KIND,
      hostLabel: config.hostLabel,
      requestHash,
      remoteShareId,
      shareUrl,
      publicArtifactSha256: publication.publicArtifactSha256
    },
    undoPayload: {},
    actor: LOCAL_ACTOR
  })

  return findHostedShareLinkRecord(db, shareLinkId)
}

export async function revokeApprovedPersonaDraftHostedShareLink(
  db: ArchiveDatabase,
  input: { shareLinkId: string }
): Promise<RevokeApprovedPersonaDraftHostedShareLinkResult | null> {
  const config = currentHostedShareHostConfig()
  if (config.availability === 'unconfigured') {
    return null
  }

  const target = listApprovedPersonaDraftHostedShareLinks(db, {})
    .find((link) => link.shareLinkId === input.shareLinkId && link.status === 'active')

  if (!target) {
    return null
  }

  const requestEnvelope = {
    shareLinkId: target.shareLinkId,
    publicationId: target.publicationId,
    draftReviewId: target.draftReviewId,
    sourceTurnId: target.sourceTurnId,
    remoteShareId: target.remoteShareId,
    shareUrl: target.shareUrl
  }
  const requestHash = sha256Json(requestEnvelope)

  const { artifactId } = persistShareHostArtifact(db, {
    shareLinkId: target.shareLinkId,
    draftReviewId: target.draftReviewId,
    publicationId: target.publicationId,
    sourceTurnId: target.sourceTurnId,
    operationKind: 'revoke',
    hostKind: HOST_KIND,
    hostLabel: config.hostLabel,
    requestHash
  })

  persistShareHostEvent(db, {
    artifactId,
    eventType: 'request',
    payload: requestEnvelope
  })

  let responseBody: Record<string, unknown>
  try {
    responseBody = await callHost({
      url: new URL(
        `/api/approved-draft-share-links/${encodeURIComponent(target.remoteShareId)}/revoke`,
        config.baseUrl
      ).toString(),
      token: config.token,
      payload: requestEnvelope
    })
  } catch (error) {
    persistShareHostEvent(db, {
      artifactId,
      eventType: 'error',
      payload: { message: (error as Error).message }
    })
    throw error
  }

  persistShareHostEvent(db, {
    artifactId,
    eventType: 'response',
    payload: responseBody
  })

  if (responseBody.status !== 'revoked') {
    const error = new Error('host returned invalid revoke response')
    persistShareHostEvent(db, {
      artifactId,
      eventType: 'error',
      payload: { message: error.message }
    })
    throw error
  }

  appendDecisionJournal(db, {
    decisionType: 'revoke_approved_persona_draft_share_link',
    targetType: 'persona_draft_review',
    targetId: target.draftReviewId,
    operationPayload: {
      shareLinkId: target.shareLinkId,
      draftReviewId: target.draftReviewId,
      publicationId: target.publicationId,
      sourceTurnId: target.sourceTurnId,
      hostKind: HOST_KIND,
      hostLabel: config.hostLabel,
      requestHash,
      remoteShareId: target.remoteShareId,
      shareUrl: target.shareUrl,
      publicArtifactSha256: target.publicArtifactSha256
    },
    undoPayload: {},
    actor: LOCAL_ACTOR
  })

  const revoked = findHostedShareLinkRecord(db, target.shareLinkId)
  return revoked?.status === 'revoked' ? revoked : null
}
