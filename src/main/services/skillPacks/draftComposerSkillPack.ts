import type { SkillPackTemplate } from './webVerifierSkillPack'

export const draftComposerSkillPack: SkillPackTemplate = {
  specialization: 'draft-composer',
  skillPackIds: ['draft-composer'],
  toolWhitelist: ['ask_memory_workspace', 'compose_reviewed_draft'],
  outputSchema: 'reviewedDraftResultSchema'
}
