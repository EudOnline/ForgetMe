import { describe, expect, it } from 'vitest'
import { authorizeToolRequest, resolveToolPolicy } from '../../../src/main/services/toolBrokerService'

describe('toolBrokerService', () => {
  it('resolves the external verification policy with network search tools enabled', () => {
    expect(resolveToolPolicy('external-verification-policy')).toEqual({
      policyId: 'external-verification-policy',
      allowedTools: ['search_web', 'open_source_page', 'capture_citation_bundle'],
      allowsNetwork: true
    })
  })

  it('blocks direct network access when the request is missing an allowed policy', () => {
    const result = authorizeToolRequest({
      role: 'workspace',
      toolName: 'search_web',
      skillPackIds: ['web-verifier'],
      remainingBudget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    })

    expect(result.status).toBe('blocked')
    expect(result.reason).toMatch(/policy/i)
  })

  it('authorizes archive-local evidence tools for bounded evidence checkers', () => {
    const result = authorizeToolRequest({
      role: 'ingestion',
      toolName: 'get_document_evidence',
      skillPackIds: ['evidence-checker'],
      toolPolicy: resolveToolPolicy('local-evidence-policy') ?? undefined,
      remainingBudget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    })

    expect(result.status).toBe('authorized')
  })

  it('resolves explicit local policies for compare, draft, and policy audit runners', () => {
    expect(resolveToolPolicy('workspace-compare-policy')).toEqual({
      policyId: 'workspace-compare-policy',
      allowedTools: ['run_compare', 'summarize_compare_results'],
      allowsNetwork: true
    })

    expect(resolveToolPolicy('draft-composer-policy')).toEqual({
      policyId: 'draft-composer-policy',
      allowedTools: ['ask_memory_workspace', 'compose_reviewed_draft'],
      allowsNetwork: false
    })

    expect(resolveToolPolicy('policy-audit-policy')).toEqual({
      policyId: 'policy-audit-policy',
      allowedTools: ['read_policy_versions', 'compare_policy_versions'],
      allowsNetwork: false
    })
  })

  it('authorizes retained bounded tools when an explicit policy is present', () => {
    expect(authorizeToolRequest({
      role: 'workspace',
      toolName: 'run_compare',
      skillPackIds: ['compare-analyst'],
      toolPolicy: resolveToolPolicy('workspace-compare-policy') ?? undefined,
      remainingBudget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    }).status).toBe('authorized')

    expect(authorizeToolRequest({
      role: 'workspace',
      toolName: 'compose_reviewed_draft',
      skillPackIds: ['draft-composer'],
      toolPolicy: resolveToolPolicy('draft-composer-policy') ?? undefined,
      remainingBudget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    }).status).toBe('authorized')

    expect(authorizeToolRequest({
      role: 'governance',
      toolName: 'compare_policy_versions',
      skillPackIds: ['policy-auditor'],
      toolPolicy: resolveToolPolicy('policy-audit-policy') ?? undefined,
      remainingBudget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    }).status).toBe('authorized')
  })
})
