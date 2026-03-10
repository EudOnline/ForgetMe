import { describe, expect, it } from 'vitest'
import { buildEventClusterCandidates } from '../../../src/main/services/candidateService'

describe('buildEventClusterCandidates', () => {
  it('groups nearby evidence into a pending event-cluster candidate', () => {
    const candidates = buildEventClusterCandidates({
      evidence: [
        { fileId: 'f1', occurredAt: '2026-03-10T10:00:00.000Z', people: ['cp-1'] },
        { fileId: 'f2', occurredAt: '2026-03-10T10:10:00.000Z', people: ['cp-1', 'cp-2'] }
      ]
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].status).toBe('pending')
    expect(candidates[0].evidenceFileIds).toEqual(['f1', 'f2'])
  })
})
