import { describe, expect, it } from 'vitest'
import {
  importPreflightInputSchema,
  relationshipLabelInputSchema,
  reviewActionSchema
} from '../../../src/shared/ipcSchemas'

describe('phase-two IPC schemas', () => {
  it('accepts a non-empty file path list', () => {
    expect(importPreflightInputSchema.parse({ sourcePaths: ['/tmp/chat.txt'] })).toBeTruthy()
  })

  it('accepts approve and undo review actions', () => {
    expect(reviewActionSchema.parse({ action: 'approve', queueItemId: 'rq-1' })).toBeTruthy()
    expect(reviewActionSchema.parse({ action: 'undo', journalId: 'dj-1' })).toBeTruthy()
  })

  it('accepts manual relationship labels', () => {
    expect(relationshipLabelInputSchema.parse({
      fromPersonId: 'cp-1',
      toPersonId: 'cp-2',
      label: 'friend'
    })).toBeTruthy()
  })
})
