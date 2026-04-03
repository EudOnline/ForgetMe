import { describe, expect, it } from 'vitest'
import { createObjectiveSubagentPlanSchemaService } from '../../../src/main/services/objectiveSubagentPlanSchemaService'

describe('objective subagent plan schema service', () => {
  it('returns a deterministic plan schema for every registered specialization', () => {
    const service = createObjectiveSubagentPlanSchemaService()

    expect(service.getSchema('web-verifier')).toEqual(expect.objectContaining({
      specialization: 'web-verifier',
      toolSequence: expect.arrayContaining(['search_web', 'open_source_page', 'capture_citation_bundle'])
    }))
    expect(service.getSchema('evidence-checker')).toEqual(expect.objectContaining({
      specialization: 'evidence-checker',
      toolSequence: expect.arrayContaining(['get_document_evidence'])
    }))
    expect(service.getSchema('compare-analyst')).toEqual(expect.objectContaining({
      specialization: 'compare-analyst',
      toolSequence: expect.arrayContaining(['run_compare', 'summarize_compare_results'])
    }))
    expect(service.getSchema('draft-composer')).toEqual(expect.objectContaining({
      specialization: 'draft-composer',
      toolSequence: expect.arrayContaining(['ask_memory_workspace', 'compose_reviewed_draft'])
    }))
    expect(service.getSchema('policy-auditor')).toEqual(expect.objectContaining({
      specialization: 'policy-auditor',
      toolSequence: expect.arrayContaining(['read_policy_versions', 'compare_policy_versions'])
    }))
  })
})
