import crypto from 'node:crypto'
import { URL } from 'node:url'
import type { ArchiveDatabase } from './db'
import { appendDecisionJournal, listDecisionJournal } from './journalService'
import {
  listApprovedPersonaDraftPublications,
  readApprovedDraftPublicationPackage
} from './approvedDraftPublicationService'

const LOCAL_ACTOR = 'local-user'
const HOST_KIND = 'configured_remote_host'

type HostConfig =
  | { status: 'configured'; baseUrl: string; token: string; hostLabel: string }
  | { status: 'unconfigured' }

function getHostConfig(): HostConfig {
  const baseUrl = process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_BASE_URL
  const token = process.env.FORGETME_APPROVED_DRAFT_SHARE_HOST_TOKEN

  if (!baseUrl || !token) {
    return { status: 'unconfigured' }
  }

  const hostLabel = new URL(baseUrl).origin
  return { status: 'configured', baseUrl: baseUrl.replace(/\/$/, ''), token, hostLabel }
}

export function getApprovedDraftHostedShareHostStatus() {
  const config = getHostConfig()
  if (config.status === 'unconfigured') {
    return { status: 'unconfigured' as const }
  }

  return {
    status: 'configured' as const,
    hostKind: HOST_KIND,
    hostLabel: config.hostLabel
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
  hostKind: string
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
  const eventId = crypto.randomUUID()

  db.prepare(`insert into persona_draft_share_host_events (
    id, artifact_id, event_type, payload_json, created_at
  ) values (?, ?, ?, ?, ?)`).run(
    eventId,
    input.artifactId,
    input.eventType,
    JSON.stringify(input.payload),
    createdAt
  )

  return { eventId, createdAt }
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

export function listApprovedPersonaDraftHostedShareLinks(
  db: ArchiveDatabase,
  input: { draftReviewId?: string }
) {
  const entries = listDecisionJournal(db, { targetType: 'persona_draft_review' })
    .filter((entry) =>
      (entry.decisionType === 'create_approved_persona_draft_share_link' || entry.decisionType === 'revoke_approved_persona_draft_share_link')
      && (!input.draftReviewId || entry.targetId === input.draftReviewId)
    )
  const links = new Map<string, {
    shareLinkId: string
    publicationId: string
    draftReviewId: string
    sourceTurnId: string
    remoteShareId: string
    shareUrl: string
    hostKind: string | null
    hostLabel: string | null
    status: 'active' | 'revoked'
    createdAt: string
  }>()

  for (const entry of entries) {
    const shareLinkId = typeof entry.operationPayload.shareLinkId === 'string'
      ? entry.operationPayload.shareLinkId
      : null
    if (!shareLinkId || links.has(shareLinkId)) {
      continue
    }

    const publicationId = typeof entry.operationPayload.publicationId === 'string'
      ? entry.operationPayload.publicationId
      : ''
    const draftReviewId = typeof entry.operationPayload.draftReviewId === 'string'
      ? entry.operationPayload.draftReviewId
      : (input.draftReviewId ?? '')
    const sourceTurnId = typeof entry.operationPayload.sourceTurnId === 'string'
      ? entry.operationPayload.sourceTurnId
      : ''
    const remoteShareId = typeof entry.operationPayload.remoteShareId === 'string'
      ? entry.operationPayload.remoteShareId
      : ''
    const shareUrl = typeof entry.operationPayload.shareUrl === 'string'
      ? entry.operationPayload.shareUrl
      : ''
    const hostKind = typeof entry.operationPayload.hostKind === 'string' ? entry.operationPayload.hostKind : null
    const hostLabel = typeof entry.operationPayload.hostLabel === 'string' ? entry.operationPayload.hostLabel : null
    const status = entry.decisionType === 'revoke_approved_persona_draft_share_link' ? 'revoked' : 'active'

    links.set(shareLinkId, {
      shareLinkId,
      publicationId,
      draftReviewId,
      sourceTurnId,
      remoteShareId,
      shareUrl,
      hostKind,
      hostLabel,
      status,
      createdAt: entry.createdAt
    })
  }

  return Array.from(links.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createApprovedPersonaDraftHostedShareLink(
  db: ArchiveDatabase,
  input: { draftReviewId: string }
) {
  const config = getHostConfig()
  if (config.status === 'unconfigured') {
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
    payload: { requestEnvelope }
  })

  let responseBody: Record<string, unknown>
  try {
    responseBody = await callHost({
      url: new URL('/api/approved-draft-share-links', config.baseUrl).toString(),
      token: config.token,
      payload: { requestEnvelope }
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

  const remoteShareId = typeof responseBody.remoteShareId === 'string' ? responseBody.remoteShareId : ''
  const shareUrl = typeof responseBody.shareUrl === 'string' ? responseBody.shareUrl : ''

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
      shareUrl
    },
    undoPayload: {},
    actor: LOCAL_ACTOR
  })

  const events = db.prepare(
    `select event_type as eventType, payload_json as payloadJson
     from persona_draft_share_host_events
     where artifact_id = ?
     order by created_at asc`
  ).all(artifactId) as Array<{ eventType: string; payloadJson: string }>

  return {
    status: 'created' as const,
    artifactId,
    shareLinkId,
    remoteShareId,
    shareUrl,
    publicationId: publication.publicationId,
    draftReviewId: publication.draftReviewId,
    sourceTurnId: publication.sourceTurnId,
    hostKind: HOST_KIND,
    hostLabel: config.hostLabel,
    requestHash,
    events: events.map((event) => ({
      eventType: event.eventType,
      payload: JSON.parse(event.payloadJson)
    }))
  }
}

export async function revokeApprovedPersonaDraftHostedShareLink(
  db: ArchiveDatabase,
  input: { shareLinkId: string }
) {
  const config = getHostConfig()
  if (config.status === 'unconfigured') {
    return null
  }

  const links = listApprovedPersonaDraftHostedShareLinks(db, {})
  const target = links.find((link) => link.shareLinkId === input.shareLinkId && link.status === 'active')

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
    hostLabel: config.hostLabel ?? '',
    requestHash
  })

  persistShareHostEvent(db, {
    artifactId,
    eventType: 'request',
    payload: { requestEnvelope }
  })

  let responseBody: Record<string, unknown>
  try {
    responseBody = await callHost({
      url: new URL(`/api/approved-draft-share-links/${encodeURIComponent(target.remoteShareId)}/revoke`, config.baseUrl).toString(),
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
      shareUrl: target.shareUrl
    },
    undoPayload: {},
    actor: LOCAL_ACTOR
  })

  const events = db.prepare(
    `select event_type as eventType, payload_json as payloadJson
     from persona_draft_share_host_events
     where artifact_id = ?
     order by created_at asc`
  ).all(artifactId) as Array<{ eventType: string; payloadJson: string }>

  return {
    status: 'revoked' as const,
    artifactId,
    shareLinkId: target.shareLinkId,
    remoteShareId: target.remoteShareId,
    shareUrl: target.shareUrl,
    publicationId: target.publicationId,
    draftReviewId: target.draftReviewId,
    sourceTurnId: target.sourceTurnId,
    hostKind: HOST_KIND,
    hostLabel: config.hostLabel,
    requestHash,
    events: events.map((event) => ({
      eventType: event.eventType,
      payload: JSON.parse(event.payloadJson)
    }))
  }
}
