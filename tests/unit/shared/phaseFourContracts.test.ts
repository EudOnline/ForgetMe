import { describe, expect, it } from 'vitest'
import { enrichmentAttemptFilterSchema } from '../../../src/shared/schemas/ops'
import { personProfileAttributeFilterSchema, profileAttributeCandidateFilterSchema } from '../../../src/shared/schemas/people'

describe('phase-four IPC schemas', () => {
  it('accepts enrichment attempt filters', () => {
    expect(enrichmentAttemptFilterSchema.parse({ jobId: 'job-1' })).toBeTruthy()
  })

  it('accepts profile attribute filters', () => {
    expect(personProfileAttributeFilterSchema.parse({ canonicalPersonId: 'cp-1', status: 'active' })).toBeTruthy()
    expect(profileAttributeCandidateFilterSchema.parse({ canonicalPersonId: 'cp-1', status: 'pending' })).toBeTruthy()
  })
})
