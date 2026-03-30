import { describe, expect, it } from 'vitest'
import { createSubagentRegistryService } from '../../../src/main/services/subagentRegistryService'

describe('subagentRegistryService', () => {
  it('creates a bounded web-verifier subagent template with the expected tools and schema', () => {
    const registry = createSubagentRegistryService()

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
  })
})
