import type {
  PersonAgentCapsulePromptBundle,
  PersonAgentCapsuleRuntimeContext,
  PersonAgentTaskRecord
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { buildPersonAgentCapsulePromptContext } from './personAgentCapsulePromptContextService'

function buildSystemPrompt(input: {
  displaySummary: string
  operationKind: PersonAgentCapsulePromptBundle['operationKind']
}) {
  return [
    `You are the dedicated capsule agent for ${input.displaySummary}`,
    'Stay grounded in approved archive memory, capsule runtime context, and recent capsule activity.',
    'Prefer stable facts first, surface conflicts and coverage gaps explicitly, and do not invent unsupported details.',
    input.operationKind === 'consultation'
      ? 'Answer the consultation question using this person-specific context.'
      : 'Execute the requested task using this person-specific context and keep the next action bounded.'
  ].join(' ')
}

function buildConsultationUserPrompt(question: string) {
  return [
    'Consultation request:',
    question,
    'Use the capsule context to answer in a grounded, person-specific way.'
  ].join('\n')
}

function buildTaskRunUserPrompt(task: {
  taskKind: PersonAgentTaskRecord['taskKind']
  summary: string
  suggestedQuestion: string | null
}) {
  return [
    `Task kind: ${task.taskKind}`,
    `Task summary: ${task.summary}`,
    task.suggestedQuestion ? `Suggested question: ${task.suggestedQuestion}` : null,
    'Use the capsule context to decide the next bounded task action.'
  ].filter(Boolean).join('\n')
}

function buildPromptBundleFromRuntimeContext(input: {
  runtimeContext: PersonAgentCapsuleRuntimeContext
  operationKind: PersonAgentCapsulePromptBundle['operationKind']
  promptInput: string
  taskKind?: PersonAgentTaskRecord['taskKind']
  suggestedQuestion?: string | null
}): PersonAgentCapsulePromptBundle {
  const systemPrompt = buildSystemPrompt({
    displaySummary: input.runtimeContext.identitySummary,
    operationKind: input.operationKind
  })

  const userPrompt = input.operationKind === 'consultation'
    ? buildConsultationUserPrompt(input.promptInput)
    : buildTaskRunUserPrompt({
        taskKind: input.taskKind ?? 'review_strategy_change',
        summary: input.promptInput,
        suggestedQuestion: input.suggestedQuestion ?? null
      })

  return {
    bundleVersion: 1,
    operationKind: input.operationKind,
    capsuleId: input.runtimeContext.capsuleId,
    personAgentId: input.runtimeContext.personAgentId,
    canonicalPersonId: input.runtimeContext.canonicalPersonId,
    sessionNamespace: input.runtimeContext.sessionNamespace,
    promptInput: input.promptInput,
    systemPrompt,
    userPrompt,
    context: {
      identitySummary: input.runtimeContext.identitySummary,
      memorySummary: input.runtimeContext.memorySummary,
      runtimeSummary: input.runtimeContext.runtimeSummary,
      latestCheckpointSummary: input.runtimeContext.latestCheckpointSummary,
      recentActivity: input.runtimeContext.recentActivity.map((entry) => entry.summary)
    }
  }
}

export function buildPersonAgentCapsuleRuntimePromptArtifacts(db: ArchiveDatabase, input: {
  personAgentId?: string
  canonicalPersonId?: string
  operationKind: PersonAgentCapsulePromptBundle['operationKind']
  promptInput: string
  taskKind?: PersonAgentTaskRecord['taskKind']
  suggestedQuestion?: string | null
}) {
  const runtimeContext = buildPersonAgentCapsulePromptContext(db, {
    personAgentId: input.personAgentId,
    canonicalPersonId: input.canonicalPersonId
  })

  return {
    runtimeContext,
    promptBundle: runtimeContext
      ? buildPromptBundleFromRuntimeContext({
          runtimeContext,
          operationKind: input.operationKind,
          promptInput: input.promptInput,
          taskKind: input.taskKind,
          suggestedQuestion: input.suggestedQuestion
        })
      : null
  }
}

export function buildPersonAgentCapsulePromptBundle(db: ArchiveDatabase, input: {
  personAgentId?: string
  canonicalPersonId?: string
  operationKind: PersonAgentCapsulePromptBundle['operationKind']
  promptInput: string
  taskKind?: PersonAgentTaskRecord['taskKind']
  suggestedQuestion?: string | null
}): PersonAgentCapsulePromptBundle | null {
  return buildPersonAgentCapsuleRuntimePromptArtifacts(db, input).promptBundle
}
