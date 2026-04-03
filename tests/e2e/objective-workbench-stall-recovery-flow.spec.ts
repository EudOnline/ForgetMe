import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { createExternalVerificationBrokerService } from '../../src/main/services/externalVerificationBrokerService'
import { createObjectiveModule } from '../../src/main/modules/objective/runtime/createObjectiveModule'
import { createSubagentRegistryService } from '../../src/main/services/subagentRegistryService'

async function seedStalledObjective(userDataDir: string) {
  const appPaths = ensureAppPaths(userDataDir)
  const objectiveModule = createObjectiveModule(appPaths)
  const session = objectiveModule.createRuntimeSession({
    externalVerificationBroker: createExternalVerificationBrokerService({
      searchWeb: async () => [],
      openSourcePage: async ({ url }) => ({
        url,
        title: null,
        publishedAt: null,
        excerpt: ''
      })
    }),
    subagentRegistry: createSubagentRegistryService(),
    roleAgentRegistry: {
      get(role: string) {
        return {
          role,
          async receive() {
            return {
              messages: []
            }
          }
        }
      }
    } as any
  })
  const { runtime } = session

  try {
    await runtime.startObjective({
      title: 'Surface stalled objective state clearly',
      objectiveKind: 'evidence_investigation',
      prompt: 'Do not generate any new evidence so the facilitator must mark the objective stalled.',
      initiatedBy: 'operator'
    })
  } finally {
    session.close()
  }
}

async function launchApp(userDataDir: string) {
  return electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })
}

test('objective workbench surfaces stalled planner state instead of looking silently idle', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-stall-e2e-'))
  await seedStalledObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  await page.getByRole('button', { name: 'Objective Workbench' }).click()
  await expect(page.getByRole('heading', { name: 'Objective Workbench' })).toBeVisible()
  await expect(page.getByText('Surface stalled objective state clearly').first()).toBeVisible()
  await expect(page.getByText('Objective stalled', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/objective status:\s*stalled/i)).toBeVisible()
  await expect(page.getByText(/thread status:\s*waiting/i)).toBeVisible()

  await electronApp.close()
})
