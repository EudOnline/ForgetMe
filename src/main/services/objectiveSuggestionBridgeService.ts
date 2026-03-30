import type {
  AgentExecutionBudget,
  AgentObjectiveKind,
  AgentProposalKind,
  AgentRole,
  AgentTriggerKind,
  CreateAgentObjectiveInput
} from '../../shared/archiveContracts'

type SuggestionTaskInput = {
  prompt: string
  role: AgentRole
  taskKind?: string
}

export type ObjectiveSeededProposal = {
  proposedByParticipantId: string
  proposalKind: AgentProposalKind
  payload: Record<string, unknown>
  ownerRole: AgentRole
  requiredApprovals?: AgentRole[]
  allowVetoBy?: AgentRole[]
  requiresOperatorConfirmation?: boolean
  toolPolicyId?: string | null
  budget?: AgentExecutionBudget | null
}

export type ObjectiveSuggestionSeed = {
  triggerKind: AgentTriggerKind
  dedupeKey: string
  sourceRunId: string | null
  objective: CreateAgentObjectiveInput
  rationale: string
  autoStartSafe: boolean
  autoApproveSeededProposal: boolean
  seededProposal: ObjectiveSeededProposal | null
}

function titleFor(input: {
  triggerKind: AgentTriggerKind
  taskKind: string
  prompt: string
}) {
  switch (input.taskKind) {
    case 'review.apply_safe_group': {
      const groupKey = input.prompt.match(/Apply safe group\s+([A-Za-z0-9-]+)/i)?.[1] ?? 'safe-group'
      return `Review safe group ${groupKey}`
    }
    case 'governance.propose_policy_update':
      return 'Draft governance policy update'
    case 'ingestion.rerun_enrichment': {
      const jobId = input.prompt.match(/Rerun failed enrichment job\s+([A-Za-z0-9-]+)/i)?.[1] ?? 'unknown-job'
      return `Recover enrichment job ${jobId}`
    }
    case 'review.suggest_safe_group_action':
      return 'Inspect safe review group'
    case 'governance.summarize_failures':
      return 'Review repeated runtime failures'
    default:
      return input.prompt.slice(0, 72) || 'Agent objective'
  }
}

function objectiveKindFor(taskKind: string): AgentObjectiveKind {
  switch (taskKind) {
    case 'review.suggest_safe_group_action':
    case 'review.apply_safe_group':
      return 'review_decision'
    case 'ingestion.rerun_enrichment':
      return 'evidence_investigation'
    case 'governance.summarize_failures':
    case 'governance.propose_policy_update':
    default:
      return 'policy_change'
  }
}

function seededProposalFor(input: {
  taskKind: string
  prompt: string
}): ObjectiveSeededProposal | null {
  switch (input.taskKind) {
    case 'review.apply_safe_group': {
      const groupKey = input.prompt.match(/Apply safe group\s+([A-Za-z0-9-]+)/i)?.[1]
      if (!groupKey) {
        return null
      }

      return {
        proposedByParticipantId: 'review',
        proposalKind: 'approve_safe_group',
        payload: {
          groupKey
        },
        ownerRole: 'review',
        requiredApprovals: ['review'],
        allowVetoBy: ['governance'],
        requiresOperatorConfirmation: true
      }
    }
    case 'governance.propose_policy_update': {
      const policyBody = input.prompt.match(/Propose policy update:\s*(.+)$/i)?.[1]?.trim()
      if (!policyBody) {
        return null
      }

      return {
        proposedByParticipantId: 'governance',
        proposalKind: 'create_policy_draft',
        payload: {
          policyKey: 'governance.review.policy',
          policyBody
        },
        ownerRole: 'governance',
        requiredApprovals: ['governance'],
        allowVetoBy: ['review'],
        requiresOperatorConfirmation: false
      }
    }
    case 'ingestion.rerun_enrichment': {
      const jobId = input.prompt.match(/Rerun failed enrichment job\s+([A-Za-z0-9-]+)/i)?.[1]
      if (!jobId) {
        return null
      }

      return {
        proposedByParticipantId: 'ingestion',
        proposalKind: 'rerun_enrichment',
        payload: {
          jobId
        },
        ownerRole: 'ingestion',
        requiredApprovals: ['ingestion'],
        allowVetoBy: ['governance'],
        requiresOperatorConfirmation: false
      }
    }
    default:
      return null
  }
}

export function buildObjectiveSuggestionSeed(input: {
  triggerKind: AgentTriggerKind
  dedupeKey: string
  sourceRunId?: string | null
  taskInput: SuggestionTaskInput
  rationale: string
  autoRunnable: boolean
}) {
  const prompt = input.taskInput.prompt.trim()
  const taskKind = input.taskInput.taskKind ?? ''
  const seededProposal = seededProposalFor({
    taskKind,
    prompt
  })

  return {
    triggerKind: input.triggerKind,
    dedupeKey: input.dedupeKey,
    sourceRunId: input.sourceRunId ?? null,
    objective: {
      title: titleFor({
        triggerKind: input.triggerKind,
        taskKind,
        prompt
      }),
      objectiveKind: objectiveKindFor(taskKind),
      prompt,
      initiatedBy: 'proposal_followup'
    },
    rationale: input.rationale,
    autoStartSafe: input.autoRunnable,
    autoApproveSeededProposal: Boolean(
      input.autoRunnable
      && seededProposal
      && seededProposal.proposalKind === 'spawn_subagent'
      && !seededProposal.requiresOperatorConfirmation
    ),
    seededProposal
  } satisfies ObjectiveSuggestionSeed
}

export async function createObjectiveFromSuggestionSeed(
  runtime: {
    startObjective(input: CreateAgentObjectiveInput): Promise<{
      objective: { objectiveId: string }
      mainThread: { threadId: string }
    }>
    createProposal(input: {
      objectiveId: string
      threadId: string
      proposedByParticipantId: string
      proposalKind: AgentProposalKind
      payload: Record<string, unknown>
      ownerRole: AgentRole
      requiredApprovals?: AgentRole[]
      allowVetoBy?: AgentRole[]
      requiresOperatorConfirmation?: boolean
      toolPolicyId?: string | null
      budget?: AgentExecutionBudget | null
    }): unknown
    getObjectiveDetail(input: { objectiveId: string }): unknown
  },
  seed: ObjectiveSuggestionSeed
) {
  const started = await runtime.startObjective(seed.objective)

  if (seed.seededProposal) {
    runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: seed.seededProposal.proposedByParticipantId,
      proposalKind: seed.seededProposal.proposalKind,
      payload: seed.seededProposal.payload,
      ownerRole: seed.seededProposal.ownerRole,
      requiredApprovals: seed.seededProposal.requiredApprovals,
      allowVetoBy: seed.seededProposal.allowVetoBy,
      requiresOperatorConfirmation: seed.seededProposal.requiresOperatorConfirmation,
      toolPolicyId: seed.seededProposal.toolPolicyId,
      budget: seed.seededProposal.budget
    })
  }

  return runtime.getObjectiveDetail({
    objectiveId: started.objective.objectiveId
  })
}
