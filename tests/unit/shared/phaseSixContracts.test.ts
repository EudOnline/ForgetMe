import { describe, expect, it } from 'vitest'
import { approveSafeReviewGroupInputSchema, backupExportInputSchema, decisionJournalFilterSchema, restoreBackupInputSchema } from '../../../src/shared/ipcSchemas'

describe('phase-six preservation schemas', () => {
  it('accepts backup export input', () => {
    expect(backupExportInputSchema.parse({
      destinationRoot: '/tmp/export-root',
      encryptionPassword: 'correct horse battery staple'
    })).toEqual({
      destinationRoot: '/tmp/export-root',
      encryptionPassword: 'correct horse battery staple'
    })
  })

  it('accepts restore input', () => {
    expect(restoreBackupInputSchema.parse({
      exportRoot: '/tmp/export-1',
      targetRoot: '/tmp/restore-root',
      encryptionPassword: 'correct horse battery staple'
    })).toEqual({
      exportRoot: '/tmp/export-1',
      targetRoot: '/tmp/restore-root',
      encryptionPassword: 'correct horse battery staple'
    })
  })

  it('accepts safe review group batch input', () => {
    expect(approveSafeReviewGroupInputSchema.parse({ groupKey: 'cp-1::profile_attribute_candidate::school_name' })).toBeTruthy()
  })

  it('accepts decision journal search filters', () => {
    expect(decisionJournalFilterSchema.parse({
      query: 'Alice Chen',
      decisionType: 'approve_safe_review_group',
      targetType: 'decision_batch'
    })).toEqual({
      query: 'Alice Chen',
      decisionType: 'approve_safe_review_group',
      targetType: 'decision_batch'
    })
  })
})
