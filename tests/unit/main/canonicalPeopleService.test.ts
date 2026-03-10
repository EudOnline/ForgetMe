import { describe, expect, it } from 'vitest'
import { chooseCanonicalPersonName } from '../../../src/main/services/canonicalPeopleService'

describe('chooseCanonicalPersonName', () => {
  it('prefers the most informative approved alias as canonical display name', () => {
    const result = chooseCanonicalPersonName([
      { displayName: 'A', sourceType: 'chat_participant', confidence: 0.8 },
      { displayName: 'Alice Chen', sourceType: 'manual', confidence: 1 }
    ])

    expect(result).toBe('Alice Chen')
  })
})
