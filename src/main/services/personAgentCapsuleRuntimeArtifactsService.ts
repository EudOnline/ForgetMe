import fs from 'node:fs'
import path from 'node:path'
import type {
  PersonAgentCapsuleArtifactKind,
  PersonAgentCapsuleArtifactRecord,
  PersonAgentCapsuleMemoryCheckpointRecord,
  PersonAgentCapsuleRecord,
  PersonAgentCapsuleRuntimeArtifacts,
  PersonAgentRecord
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  getPersonAgentRuntimeState,
  getPersonAgentRuntimeRunnerState,
  listPersonAgentTaskRuns,
  listPersonAgentTasks,
  listPersonAgentInteractionMemories
} from './governancePersistenceService'

function isLogicalCapsuleRoot(root: string) {
  return root.startsWith('person-agent://')
}

function ensureDirectoryForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function writeArtifactFile(input: {
  absolutePath: string
  payload: Record<string, unknown>
}) {
  ensureDirectoryForFile(input.absolutePath)
  fs.writeFileSync(input.absolutePath, `${JSON.stringify(input.payload, null, 2)}\n`, 'utf8')
}

function createArtifactRecord(input: {
  kind: PersonAgentCapsuleArtifactKind
  absolutePath: string
  rootPath: string
  updatedAt: string
}): PersonAgentCapsuleArtifactRecord {
  return {
    kind: input.kind,
    absolutePath: input.absolutePath,
    relativePath: path.relative(input.rootPath, input.absolutePath),
    updatedAt: input.updatedAt
  }
}

export function appendPersonAgentCapsuleActivityEvent(input: {
  capsule: PersonAgentCapsuleRecord
  event: Record<string, unknown>
}) {
  if (isLogicalCapsuleRoot(input.capsule.stateRoot)) {
    return null
  }

  const activityLogPath = path.join(input.capsule.stateRoot, 'activity-log.jsonl')
  ensureDirectoryForFile(activityLogPath)
  fs.appendFileSync(activityLogPath, `${JSON.stringify(input.event)}\n`, 'utf8')
  return activityLogPath
}

export function syncPersonAgentCapsuleRuntimeArtifacts(db: ArchiveDatabase, input: {
  capsule: PersonAgentCapsuleRecord
  personAgent: PersonAgentRecord
  checkpoint?: PersonAgentCapsuleMemoryCheckpointRecord | null
  now?: string
}): PersonAgentCapsuleRuntimeArtifacts | null {
  if (isLogicalCapsuleRoot(input.capsule.workspaceRoot) || isLogicalCapsuleRoot(input.capsule.stateRoot)) {
    return null
  }

  const now = input.now ?? new Date().toISOString()
  const runtimeState = getPersonAgentRuntimeState(db, {
    personAgentId: input.personAgent.personAgentId
  })
  const latestTaskRun = listPersonAgentTaskRuns(db, {
    personAgentId: input.personAgent.personAgentId
  })[0] ?? null
  const tasks = listPersonAgentTasks(db, {
    personAgentId: input.personAgent.personAgentId
  })
  const interactionMemories = listPersonAgentInteractionMemories(db, {
    personAgentId: input.personAgent.personAgentId
  })
  const runnerState = getPersonAgentRuntimeRunnerState(db, {})

  const identityPath = path.join(input.capsule.workspaceRoot, 'identity.json')
  writeArtifactFile({
    absolutePath: identityPath,
    payload: {
      capsuleId: input.capsule.capsuleId,
      personAgentId: input.capsule.personAgentId,
      canonicalPersonId: input.capsule.canonicalPersonId,
      capsuleStatus: input.capsule.capsuleStatus,
      activationSource: input.capsule.activationSource,
      sessionNamespace: input.capsule.sessionNamespace,
      identityProfile: input.capsule.identityProfile,
      updatedAt: now
    }
  })

  const memorySnapshotPath = path.join(input.capsule.workspaceRoot, 'memory-snapshot.json')
  writeArtifactFile({
    absolutePath: memorySnapshotPath,
    payload: {
      capsuleId: input.capsule.capsuleId,
      personAgentId: input.personAgent.personAgentId,
      canonicalPersonId: input.personAgent.canonicalPersonId,
      factsVersion: input.personAgent.factsVersion,
      interactionVersion: input.personAgent.interactionVersion,
      strategyProfileVersion: input.personAgent.strategyProfile?.profileVersion ?? null,
      latestCheckpointId: input.capsule.latestCheckpointId,
      latestCheckpointAt: input.capsule.latestCheckpointAt,
      interactionTopicCount: interactionMemories.length,
      taskCounts: {
        pending: tasks.filter((task) => task.status === 'pending').length,
        processing: tasks.filter((task) => task.status === 'processing').length,
        completed: tasks.filter((task) => task.status === 'completed').length,
        dismissed: tasks.filter((task) => task.status === 'dismissed').length
      },
      updatedAt: now
    }
  })

  const runtimeStatePath = path.join(input.capsule.stateRoot, 'runtime-state.json')
  writeArtifactFile({
    absolutePath: runtimeStatePath,
    payload: {
      capsuleId: input.capsule.capsuleId,
      personAgentId: input.personAgent.personAgentId,
      canonicalPersonId: input.personAgent.canonicalPersonId,
      sessionNamespace: input.capsule.sessionNamespace,
      activeSessionId: runtimeState?.activeSessionId ?? null,
      totalTurnCount: runtimeState?.totalTurnCount ?? 0,
      latestQuestion: runtimeState?.latestQuestion ?? null,
      lastConsultedAt: runtimeState?.lastConsultedAt ?? null,
      latestTaskRunId: latestTaskRun?.runId ?? null,
      latestTaskRunKind: latestTaskRun?.taskKind ?? null,
      latestTaskRunAt: latestTaskRun?.updatedAt ?? null,
      runtimeRunner: runnerState
        ? {
            runnerName: runnerState.runnerName,
            status: runnerState.status,
            lastCompletedAt: runnerState.lastCompletedAt,
            lastProcessedTaskCount: runnerState.lastProcessedTaskCount
          }
        : null,
      updatedAt: now
    }
  })

  const files = [
    createArtifactRecord({
      kind: 'identity',
      absolutePath: identityPath,
      rootPath: input.capsule.workspaceRoot,
      updatedAt: now
    }),
    createArtifactRecord({
      kind: 'memory_snapshot',
      absolutePath: memorySnapshotPath,
      rootPath: input.capsule.workspaceRoot,
      updatedAt: now
    }),
    createArtifactRecord({
      kind: 'runtime_state',
      absolutePath: runtimeStatePath,
      rootPath: input.capsule.stateRoot,
      updatedAt: now
    })
  ]

  if (input.checkpoint) {
    const checkpointPath = path.join(input.capsule.stateRoot, 'checkpoints', `${input.checkpoint.checkpointId}.json`)
    writeArtifactFile({
      absolutePath: checkpointPath,
      payload: {
        checkpointId: input.checkpoint.checkpointId,
        capsuleId: input.checkpoint.capsuleId,
        personAgentId: input.checkpoint.personAgentId,
        canonicalPersonId: input.checkpoint.canonicalPersonId,
        checkpointKind: input.checkpoint.checkpointKind,
        factsVersion: input.checkpoint.factsVersion,
        interactionVersion: input.checkpoint.interactionVersion,
        strategyProfileVersion: input.checkpoint.strategyProfileVersion,
        taskSnapshotAt: input.checkpoint.taskSnapshotAt,
        summary: input.checkpoint.summary,
        summaryPayload: input.checkpoint.summaryPayload,
        createdAt: input.checkpoint.createdAt
      }
    })

    files.push(createArtifactRecord({
      kind: 'checkpoint',
      absolutePath: checkpointPath,
      rootPath: input.capsule.stateRoot,
      updatedAt: now
    }))
  }

  return {
    capsuleId: input.capsule.capsuleId,
    personAgentId: input.personAgent.personAgentId,
    canonicalPersonId: input.personAgent.canonicalPersonId,
    files
  }
}
