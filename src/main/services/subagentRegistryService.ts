import crypto from 'node:crypto'
import type {
  AgentExecutionBudget,
  AgentRole,
  AgentSkillPackId
} from '../../shared/archiveContracts'
import type { SubagentPlanningSchemaId } from './objectiveSubagentPlanSchemaService'
import { draftComposerSkillPack } from './skillPacks/draftComposerSkillPack'
import { evidenceCheckerSkillPack } from './skillPacks/evidenceCheckerSkillPack'
import { webVerifierSkillPack, type SkillPackTemplate } from './skillPacks/webVerifierSkillPack'

export type SubagentProfile = SkillPackTemplate & {
  defaultToolPolicyId: string | null
  defaultBudget: AgentExecutionBudget
  planningSchema: SubagentPlanningSchemaId
  maxDelegationDepth: number
  requiresPlanApproval?: boolean
}

const SUBAGENT_PROFILES: Record<AgentSkillPackId, SubagentProfile> = {
  'web-verifier': {
    ...webVerifierSkillPack,
    defaultToolPolicyId: 'external-verification-policy',
    planningSchema: 'web-verification-plan',
    maxDelegationDepth: 2,
    defaultBudget: {
      maxRounds: 2,
      maxToolCalls: 5,
      timeoutMs: 30_000
    }
  },
  'evidence-checker': {
    ...evidenceCheckerSkillPack,
    defaultToolPolicyId: 'local-evidence-policy',
    planningSchema: 'local-evidence-check-plan',
    maxDelegationDepth: 2,
    defaultBudget: {
      maxRounds: 2,
      maxToolCalls: 2,
      timeoutMs: 30_000
    }
  },
  'policy-auditor': {
    specialization: 'policy-auditor',
    skillPackIds: ['policy-auditor'],
    toolWhitelist: ['read_policy_versions', 'compare_policy_versions'],
    outputSchema: 'policyAuditResultSchema',
    defaultToolPolicyId: 'policy-audit-policy',
    planningSchema: 'policy-audit-plan',
    maxDelegationDepth: 1,
    defaultBudget: {
      maxRounds: 2,
      maxToolCalls: 2,
      timeoutMs: 30_000
    }
  },
  'draft-composer': {
    ...draftComposerSkillPack,
    defaultToolPolicyId: 'draft-composer-policy',
    planningSchema: 'draft-composition-plan',
    maxDelegationDepth: 1,
    defaultBudget: {
      maxRounds: 2,
      maxToolCalls: 2,
      timeoutMs: 30_000
    }
  },
  'compare-analyst': {
    specialization: 'compare-analyst',
    skillPackIds: ['compare-analyst'],
    toolWhitelist: ['run_compare', 'summarize_compare_results'],
    outputSchema: 'compareAnalysisResultSchema',
    defaultToolPolicyId: 'workspace-compare-policy',
    planningSchema: 'compare-analysis-plan',
    maxDelegationDepth: 1,
    defaultBudget: {
      maxRounds: 2,
      maxToolCalls: 2,
      timeoutMs: 30_000
    }
  }
}

export type CreateRegisteredSubagentInput = {
  objectiveId: string
  threadId: string
  parentThreadId: string
  parentAgentRole: AgentRole
  specialization: AgentSkillPackId
  budget: AgentExecutionBudget
}

export type BuildSpawnSubagentSpecInput = {
  specialization: AgentSkillPackId
  payload?: Record<string, unknown>
}

export function createSubagentRegistryService() {
  function getProfile(specialization: AgentSkillPackId): SubagentProfile {
    const profile = SUBAGENT_PROFILES[specialization]
    if (!profile) {
      throw new Error(`Unknown subagent specialization: ${specialization}`)
    }

    return {
      specialization: profile.specialization,
      skillPackIds: [...profile.skillPackIds],
      toolWhitelist: [...profile.toolWhitelist],
      outputSchema: profile.outputSchema,
      defaultToolPolicyId: profile.defaultToolPolicyId,
      defaultBudget: { ...profile.defaultBudget },
      planningSchema: profile.planningSchema,
      maxDelegationDepth: profile.maxDelegationDepth,
      ...(profile.requiresPlanApproval ? { requiresPlanApproval: true } : {})
    }
  }

  return {
    getProfile,

    buildSpawnSubagentSpec(input: BuildSpawnSubagentSpecInput) {
      const profile = getProfile(input.specialization)

      return {
        payload: {
          specialization: profile.specialization,
          skillPackIds: profile.skillPackIds,
          expectedOutputSchema: profile.outputSchema,
          ...(input.payload ?? {})
        },
        toolPolicyId: profile.defaultToolPolicyId,
        budget: { ...profile.defaultBudget }
      }
    },

    createSubagent(input: CreateRegisteredSubagentInput) {
      const profile = getProfile(input.specialization)

      return {
        subagentId: crypto.randomUUID(),
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        parentThreadId: input.parentThreadId,
        parentAgentRole: input.parentAgentRole,
        specialization: profile.specialization,
        skillPackIds: profile.skillPackIds,
        toolWhitelist: profile.toolWhitelist,
        outputSchema: profile.outputSchema,
        budget: { ...input.budget }
      }
    }
  }
}
