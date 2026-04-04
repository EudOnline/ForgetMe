import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const readRepoFile = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('release tooling', () => {
  it('adds lint and packaging scripts to package.json', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    expect(packageJson.scripts?.lint).toBeTruthy()
    expect(packageJson.scripts?.pack).toBeTruthy()
    expect(packageJson.scripts?.dist).toBeTruthy()
    expect(packageJson.scripts?.['release:doctor']).toBeTruthy()
    expect(packageJson.scripts?.['dist:release']).toBeTruthy()
    expect(packageJson.scripts?.['test:unit']).toContain('scripts/run-vitest.mjs')
    expect(packageJson.scripts?.['test:e2e']).toContain('scripts/run-playwright.mjs')
    expect(packageJson.scripts?.pack).toContain('scripts/run-electron-builder.mjs')
    expect(packageJson.scripts?.dist).toContain('scripts/run-electron-builder.mjs')
    expect(packageJson.scripts?.['release:doctor']).toContain('scripts/check-release-env.mjs')
    expect(packageJson.scripts?.['dist:release']).toContain('scripts/check-release-env.mjs')
    expect(packageJson.scripts?.['verify:release']).toContain('npm run lint')
    expect(packageJson.scripts?.['verify:release']).toContain('npm run test:e2e:objective')
    expect(packageJson.scripts?.['verify:release']).toContain('npm run pack')
    expect(packageJson.devDependencies?.['electron-builder']).toBeTruthy()
    expect(packageJson.devDependencies?.eslint).toBeTruthy()
  })

  it('checks in explicit builder configuration, runner scripts, and icon assets', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'electron-builder.yml'))).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'scripts', 'run-vitest.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'scripts', 'run-playwright.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'scripts', 'run-electron-builder.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'scripts', 'check-release-env.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'build', 'entitlements.mac.plist'))).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'build', 'entitlements.mac.inherit.plist'))).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'build', 'icon.png'))).toBe(true)
  })

  it('documents lint and distribution commands in the README', () => {
    const readme = readRepoFile('README.md')

    expect(readme).toContain('npm run lint')
    expect(readme).toContain('npm run dist')
    expect(readme).toContain('npm run release:doctor')
    expect(readme).toContain('npm run dist:release')
    expect(readme).toContain('APPLE_API_KEY')
    expect(readme).toContain('CSC_LINK')
  })

  it('enables notarization-ready mac configuration', () => {
    const builderConfig = readRepoFile('electron-builder.yml')

    expect(builderConfig).toContain('hardenedRuntime: true')
    expect(builderConfig).toContain('gatekeeperAssess: false')
    expect(builderConfig).toContain('entitlements: build/entitlements.mac.plist')
    expect(builderConfig).toContain('entitlementsInherit: build/entitlements.mac.inherit.plist')
  })

  it('prints a complete release readiness report before blocking strict release mode', () => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'scripts', 'check-release-env.mjs'),
        '--require-signing',
        '--require-notarization'
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8'
      }
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('Signing:')
    expect(result.stdout).toContain('Notarization:')
    expect(result.stdout).toContain('Release readiness: BLOCKED')
    expect(result.stdout.indexOf('Notarization:')).toBeGreaterThan(result.stdout.indexOf('Signing:'))
    expect(result.stdout.indexOf('Release readiness: BLOCKED')).toBeGreaterThan(
      result.stdout.indexOf('Notarization:')
    )
  })
})
