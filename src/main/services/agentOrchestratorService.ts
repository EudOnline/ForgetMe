import type {
  AgentRole,
  AgentTaskKind,
  RunAgentTaskInput
} from '../../shared/archiveContracts'
import type { AgentAdapterMessage, AgentAdapterResult } from './agents/agentTypes'

export type AgentExecutionPlan = {
  taskKind: AgentTaskKind
  targetRole: AgentRole
  assignedRoles: AgentRole[]
  messages: AgentAdapterMessage[]
}

export type AgentReplayMetadata = Pick<AgentExecutionPlan, 'targetRole' | 'assignedRoles'>

const destructiveTaskKinds = new Set<AgentTaskKind>([
  'review.apply_safe_group',
  'review.apply_item_decision'
])

const defaultTaskKindByRole: Record<'ingestion' | 'review' | 'workspace' | 'governance', AgentTaskKind> = {
  ingestion: 'ingestion.import_batch',
  review: 'review.summarize_queue',
  workspace: 'workspace.ask_memory',
  governance: 'governance.propose_policy_update'
}

const reviewQueueItemIdPattern = /\b(?:rq-[a-z0-9-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

function inferReviewTaskKindFromPrompt(prompt: string): AgentTaskKind | null {
  const value = prompt.toLowerCase()
  const hasItemId = reviewQueueItemIdPattern.test(value)
  const hasApproveVerb = /\bapprove(?:d|ing)?\b/.test(value)
  const hasRejectVerb = /\breject(?:ed|ing)?\b/.test(value)

  if (hasItemId && (hasApproveVerb || hasRejectVerb)) {
    return 'review.apply_item_decision'
  }

  const hasSafeGroupPhrase = /\bsafe group\b/.test(value)
  const hasGroupKey = /\bgroup-[a-z0-9-]+\b/.test(value)
  const hasApplyVerb = /\bapply(?:ing)?\b/.test(value)
  if ((hasSafeGroupPhrase || hasGroupKey) && (hasApplyVerb || hasApproveVerb)) {
    return 'review.apply_safe_group'
  }

  if (/(review|queue|candidate)/.test(value) || hasItemId || hasSafeGroupPhrase || hasGroupKey) {
    return 'review.summarize_queue'
  }

  return null
}

function inferTargetRoleFromPrompt(prompt: string): 'ingestion' | 'review' | 'workspace' | 'governance' {
  const value = prompt.toLowerCase()

  if (/(policy|govern)/.test(value)) {
    return 'governance'
  }

  if (inferReviewTaskKindFromPrompt(prompt)) {
    return 'review'
  }

  if (/(import|ingest|ocr|evidence|enrichment)/.test(value)) {
    return 'ingestion'
  }

  return 'workspace'
}

function roleForTaskKind(taskKind: AgentTaskKind): AgentRole {
  if (taskKind.startsWith('ingestion.')) {
    return 'ingestion'
  }

  if (taskKind.startsWith('review.')) {
    return 'review'
  }

  if (taskKind.startsWith('workspace.')) {
    return 'workspace'
  }

  if (taskKind.startsWith('governance.')) {
    return 'governance'
  }

  return 'orchestrator'
}

function assertSafeDelegation(input: {
  taskKind: AgentTaskKind
  confirmationToken?: string
}) {
  if (destructiveTaskKinds.has(input.taskKind) && !input.confirmationToken) {
    throw new Error(`confirmation token required for task kind "${input.taskKind}"`)
  }
}

function resolveAgentExecutionTarget(input: RunAgentTaskInput): Pick<AgentExecutionPlan, 'taskKind' | 'targetRole' | 'assignedRoles'> {
  if (input.role === 'orchestrator') {
    const inferredReviewTaskKind = inferReviewTaskKindFromPrompt(input.prompt)
    const taskKind = input.taskKind && input.taskKind !== 'orchestrator.plan_next_action'
      ? input.taskKind
      : inferredReviewTaskKind ?? defaultTaskKindByRole[inferTargetRoleFromPrompt(input.prompt)]
    const targetRole = roleForTaskKind(taskKind)

    return {
      taskKind,
      targetRole,
      assignedRoles: targetRole === 'orchestrator' ? ['orchestrator'] : ['orchestrator', targetRole]
    }
  }

  const taskKind = input.taskKind ?? (
    input.role === 'review'
      ? undefined
      : defaultTaskKindByRole[input.role as 'ingestion' | 'workspace' | 'governance']
  )

  if (!taskKind) {
    throw new Error(`No task kind provided for role "${input.role}"`)
  }

  return {
    taskKind,
    targetRole: input.role,
    assignedRoles: [input.role]
  }
}

export function inferAgentReplayMetadata(input: RunAgentTaskInput): AgentReplayMetadata {
  const plan = resolveAgentExecutionTarget(input)
  return {
    targetRole: plan.targetRole,
    assignedRoles: plan.assignedRoles
  }
}

export function planAgentExecution(input: RunAgentTaskInput): AgentExecutionPlan {
  const plan = resolveAgentExecutionTarget(input)

  assertSafeDelegation({
    taskKind: plan.taskKind,
    confirmationToken: input.confirmationToken
  })

  return {
    taskKind: plan.taskKind,
    targetRole: plan.targetRole,
    assignedRoles: plan.assignedRoles,
    messages: [
      {
        sender: 'system',
        content: input.role === 'orchestrator'
          ? `Orchestrator delegated ${plan.taskKind} to ${plan.targetRole}.`
          : `Runtime executing ${plan.taskKind} with ${input.role}.`
      }
    ]
  }
}

export function summarizeAgentExecution(
  plan: AgentExecutionPlan,
  result: AgentAdapterResult
) {
  const lastAgentMessage = [...(result.messages ?? [])]
    .reverse()
    .find((message) => message.sender === 'agent')

  return lastAgentMessage?.content ?? result.summary ?? `Completed ${plan.taskKind}.`
}
