import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'

describe('ensureAppPaths', () => {
  it('creates the vault directory layout', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-paths-'))
    const paths = ensureAppPaths(root)

    expect(paths.vaultOriginalsDir).toBe(path.join(root, 'vault', 'originals'))
    expect(fs.existsSync(paths.vaultOriginalsDir)).toBe(true)
    expect(fs.existsSync(paths.importReportsDir)).toBe(true)
    expect(fs.existsSync(paths.sqliteDir)).toBe(true)
  })

  it('creates preservation report directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-paths-'))
    const paths = ensureAppPaths(root)

    expect(fs.existsSync(paths.importReportsDir)).toBe(true)
    expect(fs.existsSync(paths.preservationReportsDir)).toBe(true)
  })
})
