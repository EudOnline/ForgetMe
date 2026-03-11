import { describe, expect, it } from 'vitest'
import { enrichmentAttemptFilterSchema, personProfileAttributeFilterSchema, profileAttributeCandidateFilterSchema } from '../../../src/shared/ipcSchemas'

describe('phase-four IPC schemas', () => {
  it('accepts enrichment attempt filters', () => {
    expect(enrichmentAttemptFilterSchema.parse({ jobId: 'job-1' })).toBeTruthy()
  })

  it('accepts profile attribute filters', () => {
    expect(personProfileAttributeFilterSchema.parse({ canonicalPersonId: 'cp-1', status: 'active' })).toBeTruthy()
    expect(profileAttributeCandidateFilterSchema.parse({ canonicalPersonId: 'cp-1', status: 'pending' })).toBeTruthy()
  })
})
