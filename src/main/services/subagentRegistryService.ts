import crypto from 'node:crypto'
import type {
  AgentExecutionBudget,
  AgentRole,
  AgentSkillPackId
} from '../../shared/archiveContracts'
import { draftComposerSkillPack } from './skillPacks/draftComposerSkillPack'
import { evidenceCheckerSkillPack } from './skillPacks/evidenceCheckerSkillPack'
import { webVerifierSkillPack, type SkillPackTemplate } from './skillPacks/webVerifierSkillPack'

const SKILL_PACK_TEMPLATES: Record<AgentSkillPackId, SkillPackTemplate> = {
  'web-verifier': webVerifierSkillPack,
  'evidence-checker': evidenceCheckerSkillPack,
  'policy-auditor': {
    specialization: 'policy-auditor',
    skillPackIds: ['policy-auditor'],
    toolWhitelist: ['read_policy_versions', 'compare_policy_versions'],
    outputSchema: 'policyAuditResultSchema'
  },
  'draft-composer': draftComposerSkillPack,
  'compare-analyst': {
    specialization: 'compare-analyst',
    skillPackIds: ['compare-analyst'],
    toolWhitelist: ['run_compare', 'summarize_compare_results'],
    outputSchema: 'compareAnalysisResultSchema'
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

export function createSubagentRegistryService() {
  return {
    createSubagent(input: CreateRegisteredSubagentInput) {
      const template = SKILL_PACK_TEMPLATES[input.specialization]
      if (!template) {
        throw new Error(`Unknown subagent specialization: ${input.specialization}`)
      }

      return {
        subagentId: crypto.randomUUID(),
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        parentThreadId: input.parentThreadId,
        parentAgentRole: input.parentAgentRole,
        specialization: template.specialization,
        skillPackIds: template.skillPackIds,
        toolWhitelist: template.toolWhitelist,
        outputSchema: template.outputSchema,
        budget: input.budget
      }
    }
  }
}
