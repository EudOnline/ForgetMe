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
import {
  approvedDraftPublicationStylesheet,
  buildApprovedDraftPublicationHtmlDocument
} from './approvedDraftPublicationHtmlService'
import { buildApprovedPersonaDraftHandoffArtifact } from './personaDraftHandoffService'

const LOCAL_ACTOR = 'local-user'
const PUBLIC_ARTIFACT_FILE_NAME = 'publication.json'
const MANIFEST_FILE_NAME = 'manifest.json'
const DISPLAY_ENTRY_FILE_NAME = 'index.html' as const
const DISPLAY_STYLES_FILE_NAME = 'styles.css' as const
const EXCLUDED_FIELDS = ['reviewNotes', 'supportingExcerptIds', 'trace'] as const

type ApprovedDraftPublicationPackagePaths = {
  manifestPath: string
  publicArtifactPath: string
  displayEntryPath: string
  displayStylesPath: string
}

type ApprovedDraftPublicationPackageData = {
  manifest: Record<string, unknown>
  publication: Record<string, unknown>
  displayEntryHtml: string
  displayStylesCss: string
  publicArtifactSha256: string
}

function sha256Text(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function publicationTitle(question: string) {
  return question
}

function packagePathsFromEntryPath(entryPath: string): ApprovedDraftPublicationPackagePaths {
  const packageRoot = path.dirname(entryPath)
  return {
    manifestPath: path.join(packageRoot, MANIFEST_FILE_NAME),
    publicArtifactPath: path.join(packageRoot, PUBLIC_ARTIFACT_FILE_NAME),
    displayEntryPath: entryPath,
    displayStylesPath: path.join(packageRoot, DISPLAY_STYLES_FILE_NAME)
  }
}

function packagePathsFromRecord(record: ApprovedPersonaDraftPublicationRecord): ApprovedDraftPublicationPackagePaths {
  return {
    manifestPath: record.manifestPath,
    publicArtifactPath: record.publicArtifactPath,
    displayEntryPath: record.displayEntryPath,
    displayStylesPath: path.join(path.dirname(record.displayEntryPath), DISPLAY_STYLES_FILE_NAME)
  }
}

function validateApprovedDraftPublicationPackageBoundary(
  packagePaths: ApprovedDraftPublicationPackagePaths
) {
  if (!fs.existsSync(packagePaths.manifestPath)) {
    return `Publication package file not found: ${packagePaths.manifestPath}`
  }

  if (!fs.existsSync(packagePaths.publicArtifactPath)) {
    return `Publication package file not found: ${packagePaths.publicArtifactPath}`
  }

  if (!fs.existsSync(packagePaths.displayStylesPath)) {
    return `Publication package file not found: ${packagePaths.displayStylesPath}`
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(packagePaths.manifestPath, 'utf8')) as Record<string, unknown>
    const isValidManifest = manifest.formatVersion === 'phase10k1'
      && manifest.sourceArtifact === 'approved_persona_draft_handoff'
      && manifest.publicArtifactFileName === PUBLIC_ARTIFACT_FILE_NAME
      && manifest.displayEntryFileName === DISPLAY_ENTRY_FILE_NAME
      && manifest.displayStylesFileName === DISPLAY_STYLES_FILE_NAME

    return isValidManifest ? null : `Publication package manifest is invalid: ${packagePaths.manifestPath}`
  } catch {
    return `Publication package manifest is invalid: ${packagePaths.manifestPath}`
  }
}

function readApprovedDraftPublicationPackageFromPaths(
  packagePaths: ApprovedDraftPublicationPackagePaths
): ApprovedDraftPublicationPackageData | null {
  const validationError = validateApprovedDraftPublicationPackageBoundary(packagePaths)
  if (validationError) {
    return null
  }

  const manifestText = fs.readFileSync(packagePaths.manifestPath, 'utf8')
  const publicationText = fs.readFileSync(packagePaths.publicArtifactPath, 'utf8')
  const manifest = JSON.parse(manifestText) as Record<string, unknown>
  const publication = JSON.parse(publicationText) as Record<string, unknown>
  const displayEntryHtml = fs.readFileSync(packagePaths.displayEntryPath, 'utf8')
  const displayStylesCss = fs.readFileSync(packagePaths.displayStylesPath, 'utf8')

  return {
    manifest,
    publication,
    displayEntryHtml,
    displayStylesCss,
    publicArtifactSha256: sha256Text(publicationText)
  }
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
  const displayEntryPath = typeof entry.operationPayload.displayEntryPath === 'string'
    ? entry.operationPayload.displayEntryPath
    : (packageRoot ? path.join(packageRoot, DISPLAY_ENTRY_FILE_NAME) : null)
  const displayEntryFileName = entry.operationPayload.displayEntryFileName === DISPLAY_ENTRY_FILE_NAME
    ? DISPLAY_ENTRY_FILE_NAME
    : DISPLAY_ENTRY_FILE_NAME
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
    || !displayEntryPath
    || !displayEntryFileName
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
    displayEntryPath,
    displayEntryFileName,
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
      displayEntryFileName: DISPLAY_ENTRY_FILE_NAME,
      displayStylesFileName: DISPLAY_STYLES_FILE_NAME,
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
  const displayEntryPath = path.join(packageRoot, DISPLAY_ENTRY_FILE_NAME)
  const displayStylesPath = path.join(packageRoot, DISPLAY_STYLES_FILE_NAME)
  const publicPayload = `${JSON.stringify(publication.artifact, null, 2)}\n`
  const displayEntryPayload = buildApprovedDraftPublicationHtmlDocument({
    title: publication.artifact.title,
    question: publication.artifact.question,
    approvedDraft: publication.artifact.approvedDraft,
    publishedAt
  })
  const displayStylesPayload = approvedDraftPublicationStylesheet()
  const publicArtifactSha256 = sha256Text(publicPayload)
  const manifestPayload = `${JSON.stringify({
    ...publication.manifest,
    publicArtifactSha256
  }, null, 2)}\n`

  fs.mkdirSync(packageRoot, { recursive: true })
  fs.writeFileSync(publicArtifactPath, publicPayload, 'utf8')
  fs.writeFileSync(manifestPath, manifestPayload, 'utf8')
  fs.writeFileSync(displayEntryPath, displayEntryPayload, 'utf8')
  fs.writeFileSync(displayStylesPath, displayStylesPayload, 'utf8')

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
      displayEntryPath,
      displayEntryFileName: DISPLAY_ENTRY_FILE_NAME,
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
    displayEntryPath,
    displayEntryFileName: DISPLAY_ENTRY_FILE_NAME,
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

export function validateApprovedDraftPublicationEntryPath(entryPath: string) {
  return validateApprovedDraftPublicationPackageBoundary(packagePathsFromEntryPath(entryPath))
}

export function readApprovedDraftPublicationPackage(record: ApprovedPersonaDraftPublicationRecord) {
  if (!fs.existsSync(record.displayEntryPath)) {
    return null
  }

  const packageData = readApprovedDraftPublicationPackageFromPaths(packagePathsFromRecord(record))
  if (!packageData) {
    return null
  }

  if (packageData.publicArtifactSha256 !== record.publicArtifactSha256) {
    return null
  }

  if (packageData.manifest.publicArtifactSha256 !== record.publicArtifactSha256) {
    return null
  }

  return packageData
}
