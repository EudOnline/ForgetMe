import { describe, expect, it } from 'vitest'
import { APP_NAME, SUPPORTED_IMPORT_KINDS } from '../../../src/shared/archiveTypes'

describe('app shell constants', () => {
  it('exposes the MVP import kinds', () => {
    expect(APP_NAME).toBe('ForgetMe')
    expect(SUPPORTED_IMPORT_KINDS).toEqual(['chat', 'image', 'document'])
  })
})
