import type { AgentSkillPackId } from '../../../shared/archiveContracts'

export type SkillPackTemplate = {
  specialization: AgentSkillPackId
  skillPackIds: AgentSkillPackId[]
  toolWhitelist: string[]
  outputSchema: string
}

export const webVerifierSkillPack: SkillPackTemplate = {
  specialization: 'web-verifier',
  skillPackIds: ['web-verifier'],
  toolWhitelist: ['search_web', 'open_source_page', 'capture_citation_bundle'],
  outputSchema: 'webVerificationResultSchema'
}
