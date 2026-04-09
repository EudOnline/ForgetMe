import fs from 'node:fs'
import path from 'node:path'
import type {
  PersonAgentCapsuleActivationSource,
  PersonAgentCapsuleCheckpointKind,
  PersonAgentCapsuleRecord,
  PersonAgentRecord
} from '../../shared/archiveContracts'
import type { AppPaths } from './appPaths'
import type { ArchiveDatabase } from './db'
import {
  appendPersonAgentCapsuleMemoryCheckpoint,
  getPersonAgentCapsule,
  listPersonAgentCapsuleMemoryCheckpoints,
  upsertPersonAgentCapsule
} from './governancePersistenceService'
import { syncPersonAgentCapsuleRuntimeArtifacts } from './personAgentCapsuleRuntimeArtifactsService'

function logicalCapsuleRoot(kind: 'workspace' | 'state', personAgentId: string) {
  return `person-agent://${kind}/${personAgentId}`
}

export function resolvePersonAgentCapsuleRoots(appPaths: AppPaths | undefined, personAgentId: string) {
  if (!appPaths) {
    return {
      workspaceRoot: logicalCapsuleRoot('workspace', personAgentId),
      stateRoot: logicalCapsuleRoot('state', personAgentId)
    }
  }

  const workspaceRoot = path.join(appPaths.personAgentWorkspaceDir, personAgentId)
  const stateRoot = path.join(appPaths.personAgentStateDir, personAgentId)
  fs.mkdirSync(workspaceRoot, { recursive: true })
  fs.mkdirSync(stateRoot, { recursive: true })

  return {
    workspaceRoot,
    stateRoot
  }
}

function resolveIdentityProfile(db: ArchiveDatabase, personAgent: PersonAgentRecord) {
  const row = db.prepare(
    `select
      primary_display_name as primaryDisplayName,
      normalized_name as normalizedName
     from canonical_people
     where id = ?`
  ).get(personAgent.canonicalPersonId) as {
    primaryDisplayName: string
    normalizedName: string
  } | undefined

  return {
    primaryDisplayName: row?.primaryDisplayName ?? personAgent.canonicalPersonId,
    normalizedName: row?.normalizedName ?? personAgent.canonicalPersonId,
    promotionTier: personAgent.promotionTier,
    strategyProfileVersion: personAgent.strategyProfile?.profileVersion ?? null,
    factsVersion: personAgent.factsVersion,
    interactionVersion: personAgent.interactionVersion
  }
}

function shouldAppendCheckpoint(input: {
  existingCapsule: PersonAgentCapsuleRecord | null
  latestCheckpoint: ReturnType<typeof listPersonAgentCapsuleMemoryCheckpoints>[number] | null
  personAgent: PersonAgentRecord
}) {
  if (!input.existingCapsule || !input.latestCheckpoint) {
    return true
  }

  return (
    input.latestCheckpoint.factsVersion !== input.personAgent.factsVersion
    || input.latestCheckpoint.interactionVersion !== input.personAgent.interactionVersion
    || input.latestCheckpoint.strategyProfileVersion !== (input.personAgent.strategyProfile?.profileVersion ?? null)
  )
}

export function materializePersonAgentCapsule(db: ArchiveDatabase, input: {
  appPaths?: AppPaths
  personAgent: PersonAgentRecord
  activationSource: PersonAgentCapsuleActivationSource
  checkpointKind: PersonAgentCapsuleCheckpointKind
  taskSnapshotAt?: string | null
  summary?: string
  summaryPayload?: Record<string, unknown>
  now?: string
}) {
  const now = input.now ?? new Date().toISOString()
  const existingCapsule = getPersonAgentCapsule(db, {
    personAgentId: input.personAgent.personAgentId
  })
  const roots = existingCapsule
    ? {
        workspaceRoot: existingCapsule.workspaceRoot,
        stateRoot: existingCapsule.stateRoot
      }
    : resolvePersonAgentCapsuleRoots(input.appPaths, input.personAgent.personAgentId)

  const capsule = upsertPersonAgentCapsule(db, {
    capsuleId: existingCapsule?.capsuleId,
    personAgentId: input.personAgent.personAgentId,
    canonicalPersonId: input.personAgent.canonicalPersonId,
    capsuleStatus: 'ready',
    activationSource: existingCapsule?.activationSource ?? input.activationSource,
    sessionNamespace: existingCapsule?.sessionNamespace ?? `person-agent:${input.personAgent.personAgentId}`,
    workspaceRoot: roots.workspaceRoot,
    stateRoot: roots.stateRoot,
    identityProfile: resolveIdentityProfile(db, input.personAgent),
    latestCheckpointId: existingCapsule?.latestCheckpointId ?? null,
    latestCheckpointAt: existingCapsule?.latestCheckpointAt ?? null,
    activatedAt: input.personAgent.lastActivatedAt ?? now,
    createdAt: existingCapsule?.createdAt ?? now,
    updatedAt: now
  })

  if (!capsule) {
    return null
  }

  const latestCheckpoint = listPersonAgentCapsuleMemoryCheckpoints(db, {
    capsuleId: capsule.capsuleId,
    limit: 1
  })[0] ?? null

  if (shouldAppendCheckpoint({
    existingCapsule,
    latestCheckpoint,
    personAgent: input.personAgent
  })) {
    appendPersonAgentCapsuleMemoryCheckpoint(db, {
      capsuleId: capsule.capsuleId,
      personAgentId: input.personAgent.personAgentId,
      canonicalPersonId: input.personAgent.canonicalPersonId,
      checkpointKind: input.checkpointKind,
      factsVersion: input.personAgent.factsVersion,
      interactionVersion: input.personAgent.interactionVersion,
      strategyProfileVersion: input.personAgent.strategyProfile?.profileVersion ?? null,
      taskSnapshotAt: input.taskSnapshotAt ?? null,
      summary: input.summary ?? `Capsule ${input.checkpointKind} checkpoint.`,
      summaryPayload: input.summaryPayload ?? {},
      createdAt: now
    })
  }

  const persistedCapsule = getPersonAgentCapsule(db, {
    personAgentId: input.personAgent.personAgentId
  })
  if (persistedCapsule) {
    syncPersonAgentCapsuleRuntimeArtifacts(db, {
      capsule: persistedCapsule,
      personAgent: input.personAgent,
      checkpoint: listPersonAgentCapsuleMemoryCheckpoints(db, {
        capsuleId: persistedCapsule.capsuleId,
        limit: 1
      })[0] ?? null,
      now
    })
  }

  return persistedCapsule
}
