import { describe, expect, it } from 'vitest'
import { createSubagentRegistryService } from '../../../src/main/services/subagentRegistryService'

describe('subagentRegistryService', () => {
  it('creates a bounded web-verifier subagent template with the expected tools and schema', () => {
    const registry = createSubagentRegistryService()
    const profile = registry.getProfile('web-verifier')

    const subagent = registry.createSubagent({
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      parentThreadId: 'thread-1',
      parentAgentRole: 'workspace',
      specialization: 'web-verifier',
      budget: {
        maxRounds: 2,
        maxToolCalls: 3,
        timeoutMs: 30_000
      }
    })

    expect(subagent.skillPackIds).toEqual(['web-verifier'])
    expect(subagent.toolWhitelist).toEqual([
      'search_web',
      'open_source_page',
      'capture_citation_bundle'
    ])
    expect(subagent.outputSchema).toBe('webVerificationResultSchema')
    expect(profile.planningSchema).toBe('web-verification-plan')
    expect(profile.maxDelegationDepth).toBe(2)
  })

  it('builds a spawn_subagent spec from specialization defaults instead of requiring callers to repeat template fields', () => {
    const registry = createSubagentRegistryService()

    const spec = registry.buildSpawnSubagentSpec({
      specialization: 'evidence-checker',
      payload: {
        fileId: 'file-1'
      }
    })

    expect(spec).toEqual({
      payload: {
        specialization: 'evidence-checker',
        skillPackIds: ['evidence-checker'],
        expectedOutputSchema: 'localEvidenceCheckSchema',
        fileId: 'file-1'
      },
      toolPolicyId: 'local-evidence-policy',
      budget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    })
  })

  it('assigns concrete default tool policies to every retained specialization', () => {
    const registry = createSubagentRegistryService()

    expect(registry.buildSpawnSubagentSpec({
      specialization: 'compare-analyst',
      payload: {
        question: 'Compare the grounded answer candidates.'
      }
    })).toEqual(expect.objectContaining({
      toolPolicyId: 'workspace-compare-policy',
      budget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    }))

    expect(registry.buildSpawnSubagentSpec({
      specialization: 'draft-composer',
      payload: {
        question: 'Draft a review-ready answer.'
      }
    })).toEqual(expect.objectContaining({
      toolPolicyId: 'draft-composer-policy',
      budget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    }))

    expect(registry.buildSpawnSubagentSpec({
      specialization: 'policy-auditor',
      payload: {
        policyKey: 'governance.review.policy'
      }
    })).toEqual(expect.objectContaining({
      toolPolicyId: 'policy-audit-policy',
      budget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    }))
  })

  it('exposes plan schema metadata and delegation depth for every specialization', () => {
    const registry = createSubagentRegistryService()

    expect(registry.getProfile('evidence-checker')).toEqual(expect.objectContaining({
      planningSchema: 'local-evidence-check-plan',
      maxDelegationDepth: 2
    }))
    expect(registry.getProfile('compare-analyst')).toEqual(expect.objectContaining({
      planningSchema: 'compare-analysis-plan',
      maxDelegationDepth: 1
    }))
    expect(registry.getProfile('draft-composer')).toEqual(expect.objectContaining({
      planningSchema: 'draft-composition-plan',
      maxDelegationDepth: 1
    }))
    expect(registry.getProfile('policy-auditor')).toEqual(expect.objectContaining({
      planningSchema: 'policy-audit-plan',
      maxDelegationDepth: 1
    }))
  })
})
