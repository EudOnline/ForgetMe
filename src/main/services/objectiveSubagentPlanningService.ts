import type {
  AgentExecutionBudget,
  AgentProposalKind,
  AgentProposalRecord,
  AgentSkillPackId
} from '../../shared/archiveContracts'
import type { createSubagentRegistryService } from './subagentRegistryService'
import { createObjectiveSubagentPlanSchemaService } from './objectiveSubagentPlanSchemaService'

type SubagentRegistryService = ReturnType<typeof createSubagentRegistryService>

export type ObjectiveSubagentExecutionPlan = {
  specialization: AgentSkillPackId
  goal: string
  steps: Array<{
    stepId: string
    title: string
  }>
  expectedArtifacts: string[]
  toolSequence: Array<{
    stepId: string
    title: string
    toolName: string
    repeatable?: boolean
  }>
  stopConditions: string[]
  delegationAllowed: boolean
  estimatedBudgetUse: AgentExecutionBudget
}

type CreatePlanInput = {
  specialization: AgentSkillPackId
  proposal: Pick<AgentProposalRecord, 'proposalId' | 'proposalKind' | 'payload' | 'budget'>
}

function trimText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function createObjectiveSubagentPlanningService(dependencies: {
  subagentRegistry: SubagentRegistryService
}) {
  const planSchemaService = createObjectiveSubagentPlanSchemaService()

  return {
    createPlan(input: CreatePlanInput): ObjectiveSubagentExecutionPlan {
      const profile = dependencies.subagentRegistry.getProfile(input.specialization)
      const schema = planSchemaService.getSchema(input.specialization)
      const payload = input.proposal.payload
      const budget = input.proposal.budget ?? profile.defaultBudget

      const goalBySpecialization: Record<AgentSkillPackId, string> = {
        'web-verifier': `Verify the external claim "${trimText(payload.claim)}" using the bounded query "${trimText(payload.query)}".`,
        'evidence-checker': `Review local document evidence for file "${trimText(payload.fileId)}" and summarize the most relevant bounded evidence.`,
        'compare-analyst': `Compare bounded answer candidates for "${trimText(payload.question)}" and summarize the most trustworthy result.`,
        'draft-composer': `Prepare a reviewed simulation draft for "${trimText(payload.question)}".`,
        'policy-auditor': `Audit policy versions for "${trimText(payload.policyKey)}" and summarize the latest bounded changes.`
      }

      const shouldIncludeConditionalStep = (stepId: string) => {
        if (stepId === 'delegate-local-evidence-check') {
          return trimText(payload.localEvidenceFileId).length > 0
        }

        if (stepId === 'delegate-external-cross-check') {
          return trimText(payload.crossCheckClaim).length > 0 && trimText(payload.crossCheckQuery).length > 0
        }

        return true
      }

      const steps = schema.stepTemplates
        .filter((step) => shouldIncludeConditionalStep(step.stepId))
        .map((step) => ({
          stepId: step.stepId,
          title: step.title
        }))

      const toolSequence = schema.stepTemplates
        .filter((step) => step.toolName)
        .map((step) => ({
          stepId: step.stepId,
          title: step.title,
          toolName: step.toolName!,
          ...(step.repeatable ? { repeatable: true } : {})
        }))

      const delegationAllowed = steps.some((step) => step.stepId.startsWith('delegate-'))
      const estimatedToolCalls = Math.min(
        budget.maxToolCalls,
        toolSequence.length + (delegationAllowed ? 1 : 0)
      )

      return {
        specialization: input.specialization,
        goal: goalBySpecialization[input.specialization],
        steps,
        expectedArtifacts: [...schema.expectedArtifacts],
        toolSequence,
        stopConditions: [...schema.stopConditions],
        delegationAllowed,
        estimatedBudgetUse: {
          maxRounds: Math.min(budget.maxRounds, profile.defaultBudget.maxRounds),
          maxToolCalls: estimatedToolCalls,
          timeoutMs: Math.min(budget.timeoutMs, profile.defaultBudget.timeoutMs)
        }
      }
    }
  }
}
