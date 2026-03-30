import type { SkillPackTemplate } from './webVerifierSkillPack'

export const evidenceCheckerSkillPack: SkillPackTemplate = {
  specialization: 'evidence-checker',
  skillPackIds: ['evidence-checker'],
  toolWhitelist: ['get_document_evidence', 'read_evidence_trace', 'summarize_ocr_evidence'],
  outputSchema: 'localEvidenceCheckSchema'
}
