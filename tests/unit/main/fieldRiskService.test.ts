import { describe, expect, it } from 'vitest'
import { classifyFieldRisk } from '../../../src/main/services/fieldRiskService'

describe('classifyFieldRisk', () => {
  it('marks national id numbers as high risk and raw text as low risk', () => {
    expect(classifyFieldRisk({ fieldKey: 'national_id_number' })).toBe('high')
    expect(classifyFieldRisk({ fieldKey: 'raw_text' })).toBe('low')
    expect(classifyFieldRisk({ fieldKey: 'participant_fragment' })).toBe('high')
  })
})
