import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const forbiddenLegacyMarkers = [
  'agentPersistenceService',
  'agentPersistenceQueryService',
  'agentPersistenceMutationService',
  'agentProactiveTriggerService',
  'agentSuggestionRankingService',
  'agentSuggestionFollowupService',
  'agentAutonomyPolicy',
  'objectiveSuggestionBridgeService',
  'AgentRunTimeline'
]

function walkSourceFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(fullPath))
      continue
    }

    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }

  return files
}

describe('objective runtime legacy import guard', () => {
  it('keeps deleted run-centric services out of production source files', () => {
    const sourceFiles = [
      ...walkSourceFiles(path.resolve('src/main')),
      ...walkSourceFiles(path.resolve('src/renderer'))
    ]

    for (const filePath of sourceFiles) {
      const source = fs.readFileSync(filePath, 'utf8')
      for (const marker of forbiddenLegacyMarkers) {
        expect(source, `${path.relative(process.cwd(), filePath)} should not reference ${marker}`).not.toContain(marker)
      }
    }
  })

  it('isolates objective runtime assembly behind the objective module boundary', () => {
    const registerObjectiveIpcPath = path.resolve('src/main/modules/objective/registerObjectiveIpc.ts')
    const objectiveHandlersPath = path.resolve('src/main/modules/objective/ipc/handlers.ts')
    const createObjectiveModulePath = path.resolve('src/main/modules/objective/runtime/createObjectiveModule.ts')

    expect(fs.existsSync(objectiveHandlersPath)).toBe(true)
    expect(fs.existsSync(createObjectiveModulePath)).toBe(true)

    const registerObjectiveIpcSource = fs.readFileSync(registerObjectiveIpcPath, 'utf8')
    const objectiveHandlersSource = fs.readFileSync(objectiveHandlersPath, 'utf8')
    const createObjectiveModuleSource = fs.readFileSync(createObjectiveModulePath, 'utf8')

    expect(registerObjectiveIpcSource).toContain("from './ipc/handlers'")
    expect(registerObjectiveIpcSource).not.toContain('createObjectiveRuntimeService')
    expect(registerObjectiveIpcSource).not.toContain('createFacilitatorAgentService')
    expect(objectiveHandlersSource).toContain("from '../runtime/createObjectiveModule'")
    expect(createObjectiveModuleSource).toContain('createObjectiveRuntimeService')
  })

  it('uses the objective module factory in objective workbench e2e seed setup', () => {
    const e2eSpecs = [
      path.resolve('tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts'),
      path.resolve('tests/e2e/objective-workbench-external-verification-flow.spec.ts'),
      path.resolve('tests/e2e/objective-workbench-deliberation-flow.spec.ts')
    ]

    for (const filePath of e2eSpecs) {
      const source = fs.readFileSync(filePath, 'utf8')
      expect(source, `${path.relative(process.cwd(), filePath)} should use createObjectiveModule`).toContain(
        "from '../../src/main/modules/objective/runtime/createObjectiveModule'"
      )
      expect(source, `${path.relative(process.cwd(), filePath)} should not build the runtime directly`).not.toContain(
        "from '../../src/main/services/objectiveRuntimeService'"
      )
    }
  })
})
