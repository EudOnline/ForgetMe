import { describe, expect, it } from 'vitest'
import { reviewWorkbenchFilterSchema, reviewWorkbenchItemSchema } from '../../../src/shared/ipcSchemas'

describe('phase-five workbench schemas', () => {
  it('accepts queue-item detail input', () => {
    expect(reviewWorkbenchItemSchema.parse({ queueItemId: 'rq-1' })).toBeTruthy()
  })

  it('accepts workbench filter input', () => {
    expect(
      reviewWorkbenchFilterSchema.parse({
        itemType: 'structured_field_candidate',
        hasConflict: true
      })
    ).toBeTruthy()
  })
})
