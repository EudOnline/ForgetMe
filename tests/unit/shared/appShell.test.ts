import { describe, expect, it } from 'vitest'
import {
  APP_NAME,
  SUPPORTED_IMPORT_EXTENSIONS,
  SUPPORTED_IMPORT_FILTER_EXTENSIONS,
  SUPPORTED_IMPORT_KINDS
} from '../../../src/shared/archiveTypes'

describe('app shell constants', () => {
  it('exposes the MVP import kinds', () => {
    expect(APP_NAME).toBe('ForgetMe')
    expect(SUPPORTED_IMPORT_KINDS).toEqual(['chat', 'image', 'document'])
  })
})

describe('import capability constants', () => {
  it('exposes one canonical supported extension list', () => {
    expect(SUPPORTED_IMPORT_EXTENSIONS).toEqual(['.json', '.txt', '.jpg', '.jpeg', '.png', '.heic', '.pdf', '.docx'])
    expect(SUPPORTED_IMPORT_FILTER_EXTENSIONS).toEqual(['json', 'txt', 'jpg', 'jpeg', 'png', 'heic', 'pdf', 'docx'])
  })
})
