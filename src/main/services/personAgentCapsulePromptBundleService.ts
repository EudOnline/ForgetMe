import type {
  PersonAgentCapsulePromptBundle,
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

export function buildPersonAgentCapsulePromptBundle(db: ArchiveDatabase, input: {
  personAgentId?: string
  canonicalPersonId?: string
  operationKind: PersonAgentCapsulePromptBundle['operationKind']
  promptInput: string
  taskKind?: PersonAgentTaskRecord['taskKind']
  suggestedQuestion?: string | null
}): PersonAgentCapsulePromptBundle | null {
  const runtimeContext = buildPersonAgentCapsulePromptContext(db, {
    personAgentId: input.personAgentId,
    canonicalPersonId: input.canonicalPersonId
  })

  if (!runtimeContext) {
    return null
  }

  const systemPrompt = buildSystemPrompt({
    displaySummary: runtimeContext.identitySummary,
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
    capsuleId: runtimeContext.capsuleId,
    personAgentId: runtimeContext.personAgentId,
    canonicalPersonId: runtimeContext.canonicalPersonId,
    sessionNamespace: runtimeContext.sessionNamespace,
    promptInput: input.promptInput,
    systemPrompt,
    userPrompt,
    context: {
      identitySummary: runtimeContext.identitySummary,
      memorySummary: runtimeContext.memorySummary,
      runtimeSummary: runtimeContext.runtimeSummary,
      latestCheckpointSummary: runtimeContext.latestCheckpointSummary,
      recentActivity: runtimeContext.recentActivity.map((entry) => entry.summary)
    }
  }
}
