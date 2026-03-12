import { describe, expect, it } from 'vitest'
import { DOSSIER_DISPLAY_TYPES } from '../../../src/shared/archiveContracts'

describe('phase-seven dossier contracts', () => {
  it('exports stable dossier display types', () => {
    expect(DOSSIER_DISPLAY_TYPES).toEqual([
      'approved_fact',
      'derived_summary',
      'open_conflict',
      'coverage_gap'
    ])
  })
})
