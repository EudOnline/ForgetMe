import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const readRepoFile = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('message-native objective runtime cleanup', () => {
  it('documents the objective runtime verification commands in README', () => {
    const readme = readRepoFile('README.md')

    expect(readme).toContain('### Message-Native Objective Runtime Verification')
    expect(readme).toContain('tests/e2e/objective-workbench-deliberation-flow.spec.ts')
    expect(readme).toContain('tests/e2e/objective-workbench-external-verification-flow.spec.ts')
    expect(readme).toContain('tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts')
    expect(readme).not.toContain('Agent Console')
  })

  it('replaces the old agent e2e script with an objective workbench script', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:agent']).toBeUndefined()
    expect(packageJson.scripts?.['test:e2e:objective']).toBe(
      'npm run test:e2e -- tests/e2e/objective-workbench-deliberation-flow.spec.ts tests/e2e/objective-workbench-external-verification-flow.spec.ts tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts'
    )
  })
})
