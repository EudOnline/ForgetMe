import { describe, expect, it } from 'vitest'
import { authorizeToolRequest } from '../../../src/main/services/toolBrokerService'

describe('toolBrokerService', () => {
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
      toolPolicy: {
        policyId: 'local-evidence-policy',
        allowedTools: ['get_document_evidence'],
        allowsNetwork: false
      },
      remainingBudget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    })

    expect(result.status).toBe('authorized')
  })
})
