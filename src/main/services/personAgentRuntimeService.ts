import type {
  PersonAgentCapsuleRecord,
  PersonAgentCapsulePromptBundle,
  PersonAgentTaskRecord,
  RunPersonAgentCapsuleRuntimeInput,
  RunPersonAgentCapsuleRuntimeResult
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  appendPersonAgentAuditEvent,
  appendPersonAgentConsultationTurn,
  appendPersonAgentTaskRun,
  createPersonAgentConsultationSession,
  getPersonAgentByCanonicalPersonId,
  getPersonAgentCapsule,
  getPersonAgentConsultationSession,
  getPersonAgentRuntimeState,
  getPersonAgentTaskById,
  upsertPersonAgentRuntimeState
} from './governancePersistenceService'
import { buildPersonAgentAnswerPack } from './personAgentAnswerPackService'
import {
  appendPersonAgentCapsuleActivityEvent,
  syncPersonAgentCapsuleRuntimeArtifacts
} from './personAgentCapsuleRuntimeArtifactsService'
import { buildPersonAgentCapsuleRuntimePromptArtifacts } from './personAgentCapsulePromptBundleService'
import { runPersonAgentRuntimeLoop } from './personAgentRuntimeLoopService'
import {
  buildPersonAgentTaskExecutionRunDraft,
  syncPersonAgentTasks,
  transitionPersonAgentTaskState
} from './personAgentTaskStateService'

function resolveSessionTitle(db: ArchiveDatabase, canonicalPersonId: string) {
  const row = db.prepare(
    `select primary_display_name as displayName
     from canonical_people
     where id = ?`
  ).get(canonicalPersonId) as { displayName: string } | undefined

  return `Person Agent · ${row?.displayName ?? canonicalPersonId}`
}

function summarizeAnswerDigest(candidateAnswer: string) {
  const trimmed = candidateAnswer.trim()
  return trimmed.length <= 240 ? trimmed : `${trimmed.slice(0, 237)}...`
}

function finalizeRuntimeArtifacts(db: ArchiveDatabase, input: {
  capsule: PersonAgentCapsuleRecord | null
  canonicalPersonId: string
  now: string
  event: Record<string, unknown>
}) {
  if (!input.capsule) {
    return
  }

  const personAgent = getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })
  if (!personAgent) {
    return
  }

  syncPersonAgentCapsuleRuntimeArtifacts(db, {
    capsule: input.capsule,
    personAgent,
    now: input.now
  })
  appendPersonAgentCapsuleActivityEvent({
    capsule: input.capsule,
    event: input.event
  })
}

function prepareRuntimePromptArtifacts(db: ArchiveDatabase, input: {
  personAgentId: string
  canonicalPersonId: string
  operationKind: PersonAgentCapsulePromptBundle['operationKind']
  promptInput: string
  taskKind?: PersonAgentTaskRecord['taskKind']
  suggestedQuestion?: string | null
}) {
  return buildPersonAgentCapsuleRuntimePromptArtifacts(db, input)
}

function runConsultationRuntime(db: ArchiveDatabase, input: {
  canonicalPersonId: string
  question: string
  sessionId?: string
  now?: string
}): RunPersonAgentCapsuleRuntimeResult {
  const personAgent = getPersonAgentByCanonicalPersonId(db, {
    canonicalPersonId: input.canonicalPersonId
  })

  if (!personAgent || personAgent.status !== 'active') {
    return { resultKind: 'not_found' }
  }

  const promptArtifacts = prepareRuntimePromptArtifacts(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    operationKind: 'consultation',
    promptInput: input.question
  })
  const answerPack = buildPersonAgentAnswerPack(db, {
    canonicalPersonId: input.canonicalPersonId,
    question: input.question,
    capsulePromptBundle: promptArtifacts.promptBundle,
    capsuleRuntimeContext: promptArtifacts.runtimeContext
  })

  if (!answerPack) {
    return { resultKind: 'not_found' }
  }

  const now = input.now ?? new Date().toISOString()
  const existingSession = input.sessionId
    ? getPersonAgentConsultationSession(db, { sessionId: input.sessionId })
    : null

  if (input.sessionId && (!existingSession || existingSession.personAgentId !== personAgent.personAgentId)) {
    return { resultKind: 'not_found' }
  }

  const session = existingSession ?? createPersonAgentConsultationSession(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    title: resolveSessionTitle(db, input.canonicalPersonId),
    createdAt: now,
    updatedAt: now
  })

  const turn = appendPersonAgentConsultationTurn(db, {
    sessionId: session.sessionId,
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    question: input.question,
    answerPack,
    createdAt: now
  })

  const runtimeState = getPersonAgentRuntimeState(db, {
    personAgentId: personAgent.personAgentId
  })
  const isNewSession = !existingSession

  upsertPersonAgentRuntimeState(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: input.canonicalPersonId,
    activeSessionId: session.sessionId,
    sessionCount: isNewSession ? (runtimeState?.sessionCount ?? 0) + 1 : (runtimeState?.sessionCount ?? 1),
    totalTurnCount: (runtimeState?.totalTurnCount ?? 0) + 1,
    latestQuestion: input.question,
    latestQuestionClassification: answerPack.questionClassification,
    lastAnswerDigest: summarizeAnswerDigest(answerPack.candidateAnswer),
    lastConsultedAt: now,
    updatedAt: now
  })

  syncPersonAgentTasks(db, {
    canonicalPersonId: input.canonicalPersonId,
    now
  })
  runPersonAgentRuntimeLoop(
    db,
    {
      canonicalPersonId: input.canonicalPersonId
    },
    (taskId) => {
      const result = runTaskRuntime(db, {
        taskId,
        source: 'consultation_sync',
        now
      })
      return result.resultKind === 'task_run' ? result.taskRun : null
    }
  )

  const capsule = getPersonAgentCapsule(db, {
    personAgentId: personAgent.personAgentId,
    canonicalPersonId: input.canonicalPersonId
  })
  finalizeRuntimeArtifacts(db, {
    capsule,
    canonicalPersonId: input.canonicalPersonId,
    now,
    event: {
      eventKind: 'consultation_turn_persisted',
      capsuleId: capsule?.capsuleId ?? null,
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: input.canonicalPersonId,
      sessionId: session.sessionId,
      turnId: turn.turnId,
      question: input.question,
      createdAt: now
    }
  })

  return {
    resultKind: 'consultation_turn',
    consultationTurn: turn
  }
}

function runTaskRuntime(db: ArchiveDatabase, input: {
  taskId: string
  source?: string
  now?: string
}): RunPersonAgentCapsuleRuntimeResult {
  const task = getPersonAgentTaskById(db, {
    taskId: input.taskId
  })

  if (!task) {
    return { resultKind: 'not_found' }
  }

  if (task.status === 'completed' || task.status === 'dismissed') {
    throw new Error(`Cannot execute terminal person-agent task: ${task.taskId}`)
  }

  const now = input.now ?? new Date().toISOString()
  const runDraft = buildPersonAgentTaskExecutionRunDraft(task)
  const promptArtifacts = prepareRuntimePromptArtifacts(db, {
    personAgentId: task.personAgentId,
    canonicalPersonId: task.canonicalPersonId,
    operationKind: 'task_run',
    promptInput: runDraft.summary,
    taskKind: runDraft.taskKind,
    suggestedQuestion: runDraft.suggestedQuestion
  })
  const run = appendPersonAgentTaskRun(db, {
    ...runDraft,
    promptBundle: promptArtifacts.promptBundle,
    source: input.source ?? null,
    createdAt: now,
    updatedAt: now
  })

  if (!run) {
    return { resultKind: 'not_found' }
  }

  if (run.runStatus === 'completed') {
    transitionPersonAgentTaskState(db, {
      taskId: task.taskId,
      status: 'completed',
      source: input.source ?? 'task_executor',
      reason: `task_run:${run.runId}`,
      now
    })
  }

  const capsule = getPersonAgentCapsule(db, {
    personAgentId: task.personAgentId,
    canonicalPersonId: task.canonicalPersonId
  })

  appendPersonAgentAuditEvent(db, {
    personAgentId: task.personAgentId,
    canonicalPersonId: task.canonicalPersonId,
    eventKind: 'task_executed',
    payload: {
      runId: run.runId,
      taskId: task.taskId,
      taskKey: task.taskKey,
      taskKind: task.taskKind,
      runStatus: run.runStatus,
      source: input.source ?? null,
      capsuleId: capsule?.capsuleId ?? null,
      capsuleSessionNamespace: capsule?.sessionNamespace ?? null
    },
    createdAt: now
  })

  finalizeRuntimeArtifacts(db, {
    capsule,
    canonicalPersonId: task.canonicalPersonId,
    now,
    event: {
      eventKind: 'task_run_recorded',
      capsuleId: capsule?.capsuleId ?? null,
      personAgentId: task.personAgentId,
      canonicalPersonId: task.canonicalPersonId,
      runId: run.runId,
      taskId: task.taskId,
      taskKind: task.taskKind,
      runStatus: run.runStatus,
      source: input.source ?? null,
      createdAt: now
    }
  })

  return {
    resultKind: 'task_run',
    taskRun: run
  }
}

export function runPersonAgentRuntime(
  db: ArchiveDatabase,
  input: RunPersonAgentCapsuleRuntimeInput & { now?: string }
): RunPersonAgentCapsuleRuntimeResult {
  if (input.operationKind === 'consultation') {
    return runConsultationRuntime(db, input)
  }

  if (input.operationKind === 'transition_task') {
    const task = transitionPersonAgentTaskState(db, input)
    return task
      ? {
          resultKind: 'task_transition',
          task
        }
      : {
          resultKind: 'not_found'
        }
  }

  return runTaskRuntime(db, input)
}
