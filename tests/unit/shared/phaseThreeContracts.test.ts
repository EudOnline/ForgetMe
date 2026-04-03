import { describe, expect, it } from 'vitest'
import { documentEvidenceInputSchema, enrichmentJobFilterSchema, structuredFieldCandidateFilterSchema } from '../../../src/shared/schemas/ops'

describe('phase-three IPC schemas', () => {
  it('accepts enrichment job status filters', () => {
    expect(enrichmentJobFilterSchema.parse({ status: 'pending' })).toBeTruthy()
  })

  it('accepts document evidence and candidate filters', () => {
    expect(documentEvidenceInputSchema.parse({ fileId: 'file-1' })).toBeTruthy()
    expect(structuredFieldCandidateFilterSchema.parse({ fileId: 'file-1', status: 'pending' })).toBeTruthy()
  })
})
