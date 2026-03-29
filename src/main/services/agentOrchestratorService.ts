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

const destructiveTaskKinds = new Set<AgentTaskKind>([
  'review.apply_safe_group',
  'review.apply_item_decision'
])

const defaultTaskKindByRole: Record<'ingestion' | 'review' | 'workspace' | 'governance', AgentTaskKind> = {
  ingestion: 'ingestion.import_batch',
  review: 'review.apply_safe_group',
  workspace: 'workspace.ask_memory',
  governance: 'governance.propose_policy_update'
}

function inferTargetRoleFromPrompt(prompt: string): 'ingestion' | 'review' | 'workspace' | 'governance' {
  const value = prompt.toLowerCase()

  if (/(policy|govern)/.test(value)) {
    return 'governance'
  }

  if (/(review|queue|candidate|approve|safe group)/.test(value)) {
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

export function planAgentExecution(input: RunAgentTaskInput): AgentExecutionPlan {
  if (input.role === 'orchestrator') {
    const taskKind = input.taskKind && input.taskKind !== 'orchestrator.plan_next_action'
      ? input.taskKind
      : defaultTaskKindByRole[inferTargetRoleFromPrompt(input.prompt)]
    const targetRole = roleForTaskKind(taskKind)

    assertSafeDelegation({
      taskKind,
      confirmationToken: input.confirmationToken
    })

    return {
      taskKind,
      targetRole,
      assignedRoles: targetRole === 'orchestrator' ? ['orchestrator'] : ['orchestrator', targetRole],
      messages: [
        {
          sender: 'system',
          content: `Orchestrator delegated ${taskKind} to ${targetRole}.`
        }
      ]
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

  assertSafeDelegation({
    taskKind,
    confirmationToken: input.confirmationToken
  })

  return {
    taskKind,
    targetRole: input.role,
    assignedRoles: [input.role],
    messages: [
      {
        sender: 'system',
        content: `Runtime executing ${taskKind} with ${input.role}.`
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
