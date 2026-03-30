import type { AgentExecutionBudget, AgentRole, AgentSkillPackId } from '../../shared/archiveContracts'
import { draftComposerSkillPack } from './skillPacks/draftComposerSkillPack'
import { evidenceCheckerSkillPack } from './skillPacks/evidenceCheckerSkillPack'
import { webVerifierSkillPack, type SkillPackTemplate } from './skillPacks/webVerifierSkillPack'

const NETWORK_TOOLS = new Set([
  'search_web',
  'open_source_page',
  'extract_claims',
  'cross_source_compare',
  'capture_citation_bundle'
])

const SKILL_PACKS: Record<AgentSkillPackId, SkillPackTemplate> = {
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

export type ToolPolicy = {
  policyId: string
  allowedTools: string[]
  allowsNetwork: boolean
}

const TOOL_POLICIES: Record<string, ToolPolicy> = {
  'external-verification-policy': {
    policyId: 'external-verification-policy',
    allowedTools: ['search_web', 'open_source_page', 'capture_citation_bundle'],
    allowsNetwork: true
  },
  'tool-policy-web-1': {
    policyId: 'tool-policy-web-1',
    allowedTools: ['search_web', 'open_source_page', 'capture_citation_bundle'],
    allowsNetwork: true
  },
  'local-evidence-policy': {
    policyId: 'local-evidence-policy',
    allowedTools: ['get_document_evidence', 'read_evidence_trace', 'summarize_ocr_evidence'],
    allowsNetwork: false
  }
}

export type AuthorizeToolRequestInput = {
  role: AgentRole
  toolName: string
  skillPackIds: AgentSkillPackId[]
  toolPolicy?: ToolPolicy
  remainingBudget: AgentExecutionBudget
}

export type ToolAuthorizationResult =
  | { status: 'authorized'; reason: null }
  | { status: 'blocked'; reason: string }

export function resolveToolPolicy(policyId?: string | null): ToolPolicy | null {
  if (!policyId) {
    return null
  }

  return TOOL_POLICIES[policyId] ?? null
}

export function authorizeToolRequest(input: AuthorizeToolRequestInput): ToolAuthorizationResult {
  if (input.remainingBudget.maxToolCalls <= 0 || input.remainingBudget.maxRounds <= 0 || input.remainingBudget.timeoutMs <= 0) {
    return {
      status: 'blocked',
      reason: 'Remaining budget is exhausted.'
    }
  }

  const whitelistedTools = new Set(
    input.skillPackIds.flatMap((skillPackId) => SKILL_PACKS[skillPackId]?.toolWhitelist ?? [])
  )

  if (!whitelistedTools.has(input.toolName)) {
    return {
      status: 'blocked',
      reason: `Tool ${input.toolName} is not allowed for the selected skill pack.`
    }
  }

  if (!input.toolPolicy || !input.toolPolicy.allowedTools.includes(input.toolName)) {
    return {
      status: 'blocked',
      reason: 'Tool request is missing an allowed policy.'
    }
  }

  if (NETWORK_TOOLS.has(input.toolName) && !input.toolPolicy.allowsNetwork) {
    return {
      status: 'blocked',
      reason: 'Tool policy does not allow network access.'
    }
  }

  return {
    status: 'authorized',
    reason: null
  }
}
