import fs from 'node:fs'
import path from 'node:path'
import type { PersonAgentCapsuleRuntimeContext } from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { getPersonAgentCapsule } from './governancePersistenceService'

type JsonRecord = Record<string, unknown>

type ActivityEventSummary = PersonAgentCapsuleRuntimeContext['recentActivity'][number]

function isLogicalCapsuleRoot(root: string) {
  return root.startsWith('person-agent://')
}

function readJsonRecord(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as JsonRecord
      : null
  } catch {
    return null
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function summarizeIdentity(identityArtifact: JsonRecord) {
  const identityProfile = readObject(identityArtifact.identityProfile)
  const displayName = readString(identityProfile?.primaryDisplayName)
    ?? readString(identityArtifact.canonicalPersonId)
    ?? 'Unknown person'
  const capsuleStatus = readString(identityArtifact.capsuleStatus) ?? 'unknown'
  const activationSource = readString(identityArtifact.activationSource) ?? 'unknown'
  const promotionTier = readString(identityProfile?.promotionTier) ?? 'unknown'

  return `${displayName} capsule is ${capsuleStatus}; activation source ${activationSource}; promotion tier ${promotionTier}.`
}

function summarizeMemorySnapshot(memorySnapshotArtifact: JsonRecord) {
  const factsVersion = readNumber(memorySnapshotArtifact.factsVersion) ?? 0
  const interactionVersion = readNumber(memorySnapshotArtifact.interactionVersion) ?? 0
  const strategyProfileVersion = readNumber(memorySnapshotArtifact.strategyProfileVersion)
  const interactionTopicCount = readNumber(memorySnapshotArtifact.interactionTopicCount) ?? 0
  const taskCounts = readObject(memorySnapshotArtifact.taskCounts)

  return [
    `Facts v${factsVersion}`,
    `interactions v${interactionVersion}`,
    `strategy ${strategyProfileVersion === null ? 'unversioned' : `v${strategyProfileVersion}`}`,
    `${interactionTopicCount} interaction topics`,
    `tasks pending ${readNumber(taskCounts?.pending) ?? 0}`,
    `processing ${readNumber(taskCounts?.processing) ?? 0}`,
    `completed ${readNumber(taskCounts?.completed) ?? 0}`,
    `dismissed ${readNumber(taskCounts?.dismissed) ?? 0}`
  ].join(', ') + '.'
}

function summarizeRuntimeState(runtimeStateArtifact: JsonRecord) {
  const taskRunner = readObject(runtimeStateArtifact.taskRunner)
  const parts = [
    readString(runtimeStateArtifact.activeSessionId)
      ? `Active session ${readString(runtimeStateArtifact.activeSessionId)}`
      : 'No active session',
    `${readNumber(runtimeStateArtifact.totalTurnCount) ?? 0} total turns`
  ]

  const latestQuestion = readString(runtimeStateArtifact.latestQuestion)
  if (latestQuestion) {
    parts.push(`latest question: ${latestQuestion}`)
  }

  const lastConsultedAt = readString(runtimeStateArtifact.lastConsultedAt)
  if (lastConsultedAt) {
    parts.push(`last consulted at ${lastConsultedAt}`)
  }

  const latestTaskRunKind = readString(runtimeStateArtifact.latestTaskRunKind)
  if (latestTaskRunKind) {
    parts.push(`latest task run: ${latestTaskRunKind}`)
  }

  const runnerStatus = readString(taskRunner?.status)
  if (runnerStatus) {
    parts.push(`runner ${runnerStatus}`)
  }

  return `${parts.join('; ')}.`
}

function summarizeCheckpoint(checkpointArtifact: JsonRecord | null) {
  if (!checkpointArtifact) {
    return null
  }

  const checkpointKind = readString(checkpointArtifact.checkpointKind) ?? 'unknown'
  const createdAt = readString(checkpointArtifact.createdAt) ?? 'unknown time'
  const factsVersion = readNumber(checkpointArtifact.factsVersion) ?? 0
  const interactionVersion = readNumber(checkpointArtifact.interactionVersion) ?? 0
  const summary = readString(checkpointArtifact.summary)

  return `${checkpointKind} checkpoint at ${createdAt}; facts v${factsVersion}, interactions v${interactionVersion}.${summary ? ` ${summary}` : ''}`
}

function summarizeActivityEvent(event: JsonRecord): ActivityEventSummary {
  const eventKind = readString(event.eventKind) ?? 'unknown'

  if (eventKind === 'consultation_turn_persisted') {
    const question = readString(event.question)
    return {
      eventKind,
      createdAt: readString(event.createdAt),
      summary: question
        ? `Consultation turn persisted for question: ${question}.`
        : 'Consultation turn persisted.'
    }
  }

  if (eventKind === 'capsule_checkpoint_written') {
    const checkpointKind = readString(event.checkpointKind) ?? 'unknown'
    return {
      eventKind,
      createdAt: readString(event.createdAt),
      summary: `${checkpointKind} capsule checkpoint written.`
    }
  }

  if (eventKind === 'task_run_recorded') {
    const taskKind = readString(event.taskKind) ?? 'unknown'
    const runStatus = readString(event.runStatus) ?? 'unknown'
    return {
      eventKind,
      createdAt: readString(event.createdAt),
      summary: `Task run recorded for ${taskKind} (${runStatus}).`
    }
  }

  return {
    eventKind,
    createdAt: readString(event.createdAt),
    summary: `Activity event ${eventKind}.`
  }
}

function readRecentActivity(stateRoot: string, limit: number) {
  const activityLogPath = path.join(stateRoot, 'activity-log.jsonl')
  if (!fs.existsSync(activityLogPath)) {
    return [] as ActivityEventSummary[]
  }

  const events = fs.readFileSync(activityLogPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? [parsed as JsonRecord]
          : []
      } catch {
        return []
      }
    })

  return events
    .slice(-limit)
    .reverse()
    .map(summarizeActivityEvent)
}

export function buildPersonAgentCapsulePromptContext(db: ArchiveDatabase, input: {
  personAgentId?: string
  canonicalPersonId?: string
  activityLimit?: number
}): PersonAgentCapsuleRuntimeContext | null {
  const capsule = getPersonAgentCapsule(db, {
    personAgentId: input.personAgentId,
    canonicalPersonId: input.canonicalPersonId
  })

  if (!capsule) {
    return null
  }

  if (isLogicalCapsuleRoot(capsule.workspaceRoot) || isLogicalCapsuleRoot(capsule.stateRoot)) {
    return null
  }

  const identityArtifact = readJsonRecord(path.join(capsule.workspaceRoot, 'identity.json'))
  const memorySnapshotArtifact = readJsonRecord(path.join(capsule.workspaceRoot, 'memory-snapshot.json'))
  const runtimeStateArtifact = readJsonRecord(path.join(capsule.stateRoot, 'runtime-state.json'))

  if (!identityArtifact || !memorySnapshotArtifact || !runtimeStateArtifact) {
    return null
  }

  const latestCheckpointId = readString(memorySnapshotArtifact.latestCheckpointId) ?? capsule.latestCheckpointId
  const latestCheckpointArtifact = latestCheckpointId
    ? readJsonRecord(path.join(capsule.stateRoot, 'checkpoints', `${latestCheckpointId}.json`))
    : null

  return {
    capsuleId: capsule.capsuleId,
    personAgentId: capsule.personAgentId,
    canonicalPersonId: capsule.canonicalPersonId,
    sessionNamespace: readString(identityArtifact.sessionNamespace) ?? capsule.sessionNamespace,
    identitySummary: summarizeIdentity(identityArtifact),
    memorySummary: summarizeMemorySnapshot(memorySnapshotArtifact),
    runtimeSummary: summarizeRuntimeState(runtimeStateArtifact),
    latestCheckpointSummary: summarizeCheckpoint(latestCheckpointArtifact),
    recentActivity: readRecentActivity(capsule.stateRoot, input.activityLimit ?? 4)
  }
}
