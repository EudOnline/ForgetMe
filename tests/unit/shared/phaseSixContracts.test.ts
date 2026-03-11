import { describe, expect, it } from 'vitest'
import { backupExportInputSchema, restoreBackupInputSchema } from '../../../src/shared/ipcSchemas'

describe('phase-six preservation schemas', () => {
  it('accepts backup export input', () => {
    expect(backupExportInputSchema.parse({ destinationRoot: '/tmp/export-root' })).toBeTruthy()
  })

  it('accepts restore input', () => {
    expect(restoreBackupInputSchema.parse({ exportRoot: '/tmp/export-1', targetRoot: '/tmp/restore-root' })).toBeTruthy()
  })
})
