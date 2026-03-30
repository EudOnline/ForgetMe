import { describe, expect, it, vi } from 'vitest'
import type { AgentProposalRecord } from '../../../src/shared/archiveContracts'
import { createSpawnSubagentRunnerRegistry } from '../../../src/main/services/spawnSubagentRunnerRegistryService'

function createProposal(payload: Record<string, unknown>): AgentProposalRecord {
  return {
    proposalId: 'proposal-1',
    objectiveId: 'objective-1',
    threadId: 'thread-1',
    proposedByParticipantId: 'subagent-1',
    proposalKind: 'spawn_subagent',
    payload,
    ownerRole: 'workspace',
    status: 'committed',
    requiredApprovals: ['workspace'],
    allowVetoBy: ['governance'],
    requiresOperatorConfirmation: false,
    toolPolicyId: 'external-verification-policy',
    budget: {
      maxRounds: 2,
      maxToolCalls: 3,
      timeoutMs: 30_000
    },
    derivedFromMessageIds: [],
    artifactRefs: [],
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
    committedAt: '2026-03-30T00:00:00.000Z'
  }
}

describe('spawnSubagentRunnerRegistryService', () => {
  it('routes committed spawn_subagent proposals through the registered specialization runner table', async () => {
    const runWebVerifier = vi.fn(async () => ({ ok: true }))
    const registry = createSpawnSubagentRunnerRegistry({
      'web-verifier': {
        parsePayload(payload) {
          return {
            claim: String(payload.claim ?? ''),
            query: String(payload.query ?? '')
          }
        },
        run: runWebVerifier
      }
    })

    const result = await registry.executeCommittedProposal(createProposal({
      specialization: 'web-verifier',
      claim: 'The claim',
      query: 'The query'
    }))

    expect(result).toEqual({ ok: true })
    expect(runWebVerifier).toHaveBeenCalledWith(expect.objectContaining({
      requestedByParticipantId: 'subagent-1',
      payload: {
        claim: 'The claim',
        query: 'The query'
      }
    }))
  })

  it('throws a clear error when no runner is registered for the specialization', async () => {
    const registry = createSpawnSubagentRunnerRegistry({})

    await expect(registry.executeCommittedProposal(createProposal({
      specialization: 'draft-composer'
    }))).rejects.toThrow(/unsupported subagent specialization/i)
  })
})
