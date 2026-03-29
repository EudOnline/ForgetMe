import { describe, expect, it } from 'vitest'
import {
  APP_NAME,
  isSupportedImportExtension,
  SUPPORTED_IMAGE_IMPORT_EXTENSIONS,
  SUPPORTED_IMPORT_FILTER_LABEL,
  SUPPORTED_IMPORT_EXTENSIONS,
  SUPPORTED_IMPORT_FILTER_EXTENSIONS,
  SUPPORTED_IMPORT_KINDS,
  SUPPORTED_DOCUMENT_IMPORT_EXTENSIONS
} from '../../../src/shared/archiveTypes'

describe('app shell constants', () => {
  it('exposes the MVP import kinds', () => {
    expect(APP_NAME).toBe('ForgetMe')
    expect(SUPPORTED_IMPORT_KINDS).toEqual(['chat', 'image', 'document'])
  })
})

describe('import capability constants', () => {
  it('exposes one canonical supported extension list', () => {
    expect(SUPPORTED_IMPORT_FILTER_LABEL).toBe('Supported imports')
    expect(SUPPORTED_IMPORT_EXTENSIONS).toEqual(['.json', '.txt', '.jpg', '.jpeg', '.png', '.heic', '.pdf', '.docx'])
    expect(SUPPORTED_IMPORT_FILTER_EXTENSIONS).toEqual(['json', 'txt', 'jpg', 'jpeg', 'png', 'heic', 'pdf', 'docx'])
    expect(SUPPORTED_IMAGE_IMPORT_EXTENSIONS).toEqual(['.jpg', '.jpeg', '.png', '.heic'])
    expect(SUPPORTED_DOCUMENT_IMPORT_EXTENSIONS).toEqual(['.pdf', '.docx', '.txt'])
  })

  it('derives filter extensions and support checks from canonical extension values', () => {
    expect(SUPPORTED_IMPORT_FILTER_EXTENSIONS).toEqual(SUPPORTED_IMPORT_EXTENSIONS.map((ext) => ext.slice(1)))
    expect(isSupportedImportExtension('.json')).toBe(true)
    expect(isSupportedImportExtension('')).toBe(false)
    expect(isSupportedImportExtension('.zip')).toBe(false)
  })
})
