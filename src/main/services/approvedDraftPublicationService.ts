import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type {
  ApprovedPersonaDraftPublicationArtifact,
  ApprovedPersonaDraftPublicationRecord,
  ListApprovedPersonaDraftPublicationsInput,
  PublishApprovedPersonaDraftInput,
  PublishApprovedPersonaDraftResult
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { appendDecisionJournal, listDecisionJournal } from './journalService'
import { buildApprovedPersonaDraftHandoffArtifact } from './personaDraftHandoffService'

const LOCAL_ACTOR = 'local-user'
const PUBLIC_ARTIFACT_FILE_NAME = 'publication.json'
const MANIFEST_FILE_NAME = 'manifest.json'
const EXCLUDED_FIELDS = ['reviewNotes', 'supportingExcerptIds', 'trace'] as const

function sha256Text(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function publicationTitle(question: string) {
  return question
}

function mapPublicationRecord(entry: ReturnType<typeof listDecisionJournal>[number]): ApprovedPersonaDraftPublicationRecord | null {
  if (entry.decisionType !== 'publish_approved_persona_draft') {
    return null
  }

  const publicationId = typeof entry.operationPayload.publicationId === 'string'
    ? entry.operationPayload.publicationId
    : null
  const sourceTurnId = typeof entry.operationPayload.sourceTurnId === 'string'
    ? entry.operationPayload.sourceTurnId
    : null
  const publicationKind = entry.operationPayload.publicationKind === 'local_share_package'
    ? 'local_share_package'
    : null
  const packageRoot = typeof entry.operationPayload.packageRoot === 'string'
    ? entry.operationPayload.packageRoot
    : null
  const manifestPath = typeof entry.operationPayload.manifestPath === 'string'
    ? entry.operationPayload.manifestPath
    : null
  const publicArtifactPath = typeof entry.operationPayload.publicArtifactPath === 'string'
    ? entry.operationPayload.publicArtifactPath
    : null
  const publicArtifactFileName = typeof entry.operationPayload.publicArtifactFileName === 'string'
    ? entry.operationPayload.publicArtifactFileName
    : null
  const publicArtifactSha256 = typeof entry.operationPayload.publicArtifactSha256 === 'string'
    ? entry.operationPayload.publicArtifactSha256
    : null
  const publishedAt = typeof entry.operationPayload.publishedAt === 'string'
    ? entry.operationPayload.publishedAt
    : null

  if (
    !publicationId
    || !sourceTurnId
    || !publicationKind
    || !packageRoot
    || !manifestPath
    || !publicArtifactPath
    || !publicArtifactFileName
    || !publicArtifactSha256
    || !publishedAt
  ) {
    return null
  }

  return {
    journalId: entry.id,
    publicationId,
    draftReviewId: entry.targetId,
    sourceTurnId,
    publicationKind,
    status: 'published',
    packageRoot,
    manifestPath,
    publicArtifactPath,
    publicArtifactFileName,
    publicArtifactSha256,
    publishedAt
  }
}

export function buildApprovedPersonaDraftPublicationArtifact(
  db: ArchiveDatabase,
  input: { draftReviewId: string; publishedAt?: string }
) {
  const handoffArtifact = buildApprovedPersonaDraftHandoffArtifact(db, {
    draftReviewId: input.draftReviewId,
    exportedAt: input.publishedAt
  })

  if (!handoffArtifact) {
    return null
  }

  const publishedAt = input.publishedAt ?? new Date().toISOString()
  const publicationId = crypto.randomUUID()

  return {
    artifact: {
      formatVersion: 'phase10k1',
      publicationKind: 'local_share_package',
      publishedAt,
      publicationId,
      title: publicationTitle(handoffArtifact.question),
      question: handoffArtifact.question,
      approvedDraft: handoffArtifact.approvedDraft,
      shareEnvelope: {
        requestShape: 'local_share_persona_draft_publication',
        policyKey: 'persona_draft.local_publish_share'
      }
    } satisfies ApprovedPersonaDraftPublicationArtifact,
    manifest: {
      formatVersion: 'phase10k1',
      publicationId,
      publicationKind: 'local_share_package',
      publishedAt,
      draftReviewId: handoffArtifact.draftReviewId,
      sourceTurnId: handoffArtifact.sourceTurnId,
      scope: handoffArtifact.scope,
      workflowKind: handoffArtifact.workflowKind,
      sourceArtifact: 'approved_persona_draft_handoff',
      publicArtifactFileName: PUBLIC_ARTIFACT_FILE_NAME,
      excludedFields: [...EXCLUDED_FIELDS],
      shareEnvelope: {
        requestShape: 'local_share_persona_draft_publication',
        policyKey: 'persona_draft.local_publish_share'
      }
    },
    sourceTurnId: handoffArtifact.sourceTurnId
  }
}

export function publishApprovedPersonaDraftToDirectory(
  db: ArchiveDatabase,
  input: PublishApprovedPersonaDraftInput
) {
  const publishedAt = new Date().toISOString()
  const publication = buildApprovedPersonaDraftPublicationArtifact(db, {
    draftReviewId: input.draftReviewId,
    publishedAt
  })

  if (!publication) {
    return null
  }

  const packageRoot = path.join(
    input.destinationRoot,
    `approved-draft-publication-${publication.artifact.publicationId}`
  )
  const publicArtifactPath = path.join(packageRoot, PUBLIC_ARTIFACT_FILE_NAME)
  const manifestPath = path.join(packageRoot, MANIFEST_FILE_NAME)
  const publicPayload = `${JSON.stringify(publication.artifact, null, 2)}\n`
  const publicArtifactSha256 = sha256Text(publicPayload)
  const manifestPayload = `${JSON.stringify({
    ...publication.manifest,
    publicArtifactSha256
  }, null, 2)}\n`

  fs.mkdirSync(packageRoot, { recursive: true })
  fs.writeFileSync(publicArtifactPath, publicPayload, 'utf8')
  fs.writeFileSync(manifestPath, manifestPayload, 'utf8')

  const journal = appendDecisionJournal(db, {
    decisionType: 'publish_approved_persona_draft',
    targetType: 'persona_draft_review',
    targetId: input.draftReviewId,
    operationPayload: {
      publicationId: publication.artifact.publicationId,
      draftReviewId: input.draftReviewId,
      sourceTurnId: publication.sourceTurnId,
      publicationKind: publication.artifact.publicationKind,
      packageRoot,
      manifestPath,
      publicArtifactPath,
      publicArtifactFileName: PUBLIC_ARTIFACT_FILE_NAME,
      publicArtifactSha256,
      publishedAt,
      sourceArtifact: 'approved_persona_draft_handoff'
    },
    undoPayload: {},
    actor: LOCAL_ACTOR
  })

  return {
    status: 'published',
    journalId: journal.journalId,
    publicationId: publication.artifact.publicationId,
    draftReviewId: input.draftReviewId,
    sourceTurnId: publication.sourceTurnId,
    publicationKind: publication.artifact.publicationKind,
    packageRoot,
    manifestPath,
    publicArtifactPath,
    publicArtifactFileName: PUBLIC_ARTIFACT_FILE_NAME,
    publicArtifactSha256,
    publishedAt
  } satisfies PublishApprovedPersonaDraftResult
}

export function listApprovedPersonaDraftPublications(
  db: ArchiveDatabase,
  input: ListApprovedPersonaDraftPublicationsInput
) {
  return listDecisionJournal(db, {
    decisionType: 'publish_approved_persona_draft',
    targetType: 'persona_draft_review'
  })
    .filter((entry) => entry.targetId === input.draftReviewId)
    .map(mapPublicationRecord)
    .filter((record): record is ApprovedPersonaDraftPublicationRecord => record !== null)
}
