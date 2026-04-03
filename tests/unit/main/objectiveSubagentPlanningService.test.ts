import { describe, expect, it } from 'vitest'
import { createObjectiveSubagentPlanningService } from '../../../src/main/services/objectiveSubagentPlanningService'
import { createSubagentRegistryService } from '../../../src/main/services/subagentRegistryService'

describe('objective subagent planning service', () => {
  it('builds a deterministic web-verifier execution plan with explicit delegation allowance', () => {
    const registry = createSubagentRegistryService()
    const service = createObjectiveSubagentPlanningService({
      subagentRegistry: registry
    })

    const plan = service.createPlan({
      specialization: 'web-verifier',
      proposal: {
        proposalId: 'proposal-1',
        proposalKind: 'spawn_subagent',
        payload: {
          claim: 'The source confirms the announcement date.',
          query: 'official announcement date',
          localEvidenceFileId: 'file-1'
        },
        budget: {
          maxRounds: 2,
          maxToolCalls: 5,
          timeoutMs: 30_000
        }
      }
    })

    expect(plan.goal).toMatch(/announcement date/i)
    expect(plan.steps.map((step) => step.stepId)).toEqual([
      'search-sources',
      'inspect-sources',
      'capture-citation-bundle',
      'delegate-local-evidence-check'
    ])
    expect(plan.toolSequence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stepId: 'search-sources',
        toolName: 'search_web'
      }),
      expect.objectContaining({
        stepId: 'inspect-sources',
        toolName: 'open_source_page',
        repeatable: true
      }),
      expect.objectContaining({
        stepId: 'capture-citation-bundle',
        toolName: 'capture_citation_bundle'
      })
    ]))
    expect(plan.delegationAllowed).toBe(true)
    expect(plan.estimatedBudgetUse.maxToolCalls).toBeLessThanOrEqual(5)
  })

  it('builds an evidence-checker plan that cross-checks externally only when requested', () => {
    const registry = createSubagentRegistryService()
    const service = createObjectiveSubagentPlanningService({
      subagentRegistry: registry
    })

    const plan = service.createPlan({
      specialization: 'evidence-checker',
      proposal: {
        proposalId: 'proposal-2',
        proposalKind: 'spawn_subagent',
        payload: {
          fileId: 'file-2'
        },
        budget: {
          maxRounds: 2,
          maxToolCalls: 2,
          timeoutMs: 30_000
        }
      }
    })

    expect(plan.steps.map((step) => step.stepId)).toEqual([
      'load-document-evidence',
      'summarize-local-evidence'
    ])
    expect(plan.delegationAllowed).toBe(false)
    expect(plan.expectedArtifacts).toContain('file')
  })
})
