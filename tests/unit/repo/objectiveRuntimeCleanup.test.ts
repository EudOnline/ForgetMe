import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const readRepoFile = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('message-native objective runtime cleanup', () => {
  it('documents the objective runtime verification commands and operator docs in README', () => {
    const readme = readRepoFile('README.md')

    expect(readme).toContain('### Message-Native Objective Runtime Verification')
    expect(readme).toContain('docs/agent-runtime-risk-matrix.md')
    expect(readme).toContain('docs/agent-runtime-operator-playbook.md')
    expect(readme).toContain('npm run test:e2e:objective')
    expect(readme).toContain('npm run test:typecheck')
    expect(readme).toContain('tests/unit/main/objectiveRuntimeTelemetryService.test.ts')
    expect(readme).not.toContain('Agent Console')
  })

  it('locks the release gate onto the final objective runtime verification path', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:agent']).toBeUndefined()
    expect(packageJson.scripts?.['test:e2e:objective']).toBe(
      'npm run test:e2e -- tests/e2e/objective-workbench-deliberation-flow.spec.ts tests/e2e/objective-workbench-external-verification-flow.spec.ts tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts'
    )
    expect(packageJson.scripts?.['verify:release']).toContain('npm run test:unit')
    expect(packageJson.scripts?.['verify:release']).toContain('npm run test:e2e:objective')
  })

  it('removes stale agent-console UI strings and key usage from the active renderer', () => {
    const i18n = readRepoFile('src/renderer/i18n.tsx')
    const importPage = readRepoFile('src/renderer/pages/ImportPage.tsx')

    expect(i18n).not.toContain('nav.agentConsole')
    expect(i18n).not.toContain('page.ops.agentConsole')
    expect(i18n).not.toContain('agentConsole.')
    expect(importPage).not.toContain("t('agentConsole.openReviewQueue')")
    expect(importPage).toContain("t('import.outcome.openReviewQueue')")
  })

  it('checks in the frozen runtime risk matrix and operator playbook', () => {
    expect(readRepoFile('docs/agent-runtime-risk-matrix.md')).toContain('# Agent Runtime Risk Matrix')
    expect(readRepoFile('docs/agent-runtime-operator-playbook.md')).toContain('# Agent Runtime Operator Playbook')
  })
})
