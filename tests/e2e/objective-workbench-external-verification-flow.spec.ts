import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { createExternalVerificationBrokerService } from '../../src/main/services/externalVerificationBrokerService'
import { createObjectiveModule } from '../../src/main/modules/objective/runtime/createObjectiveModule'
import { createSubagentRegistryService } from '../../src/main/services/subagentRegistryService'

async function seedExternalVerificationObjective(userDataDir: string) {
  const appPaths = ensureAppPaths(userDataDir)
  const objectiveModule = createObjectiveModule(appPaths)
  const session = objectiveModule.createRuntimeSession({
    externalVerificationBroker: createExternalVerificationBrokerService({
      searchWeb: async () => [
        {
          title: 'Official announcement result',
          url: 'https://records.example.gov/releases/announcement',
          snippet: 'The official record lists an announcement date of March 30, 2026.',
          publishedAt: null
        }
      ],
      openSourcePage: async ({ url }) => ({
        url,
        title: 'Official announcement record',
        publishedAt: '2026-03-30T00:00:00.000Z',
        excerpt: 'The announcement date is March 30, 2026. The official record was published by the agency.'
      })
    }),
    subagentRegistry: createSubagentRegistryService(),
    roleAgentRegistry: null
  })
  const { runtime } = session

  try {
    const started = await runtime.startObjective({
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the external source before we answer the user.',
      initiatedBy: 'operator'
    })

    await runtime.requestExternalVerification({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      claim: 'The source confirms the announcement date.',
      query: 'official announcement date'
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

test('objective workbench shows bounded external verification checkpoints', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-verification-e2e-'))
  await seedExternalVerificationObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  await page.getByRole('button', { name: 'Objective Workbench' }).click()
  await expect(page.getByRole('heading', { name: 'Objective Workbench' })).toBeVisible()
  await expect(page.getByText('Verify an external claim before responding').first()).toBeVisible()
  await expect(page.getByText('Subagent spawned', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('External verification completed', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('verify external claim', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Web verification/i }).first()).toBeVisible()

  await electronApp.close()
})
