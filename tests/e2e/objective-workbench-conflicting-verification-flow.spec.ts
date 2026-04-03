import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { createExternalVerificationBrokerService } from '../../src/main/services/externalVerificationBrokerService'
import { createObjectiveModule } from '../../src/main/modules/objective/runtime/createObjectiveModule'
import { createSubagentRegistryService } from '../../src/main/services/subagentRegistryService'

async function seedConflictingVerificationObjective(userDataDir: string) {
  const appPaths = ensureAppPaths(userDataDir)
  const objectiveModule = createObjectiveModule(appPaths)
  const session = objectiveModule.createRuntimeSession({
    externalVerificationBroker: createExternalVerificationBrokerService({
      searchWeb: async () => [
        {
          title: 'Official announcement result',
          url: 'https://records.example.gov/releases/announcement',
          snippet: 'The official record lists an announcement date of March 30, 2026.',
          publishedAt: '2026-03-30T00:00:00.000Z'
        },
        {
          title: 'Official correction result',
          url: 'https://records.example.gov/releases/correction',
          snippet: 'The official correction updates the date to April 2, 2026.',
          publishedAt: '2026-03-31T00:00:00.000Z'
        }
      ],
      openSourcePage: async ({ url }) => {
        if (url.endsWith('/correction')) {
          return {
            url,
            title: 'Official correction record',
            publishedAt: '2026-03-31T00:00:00.000Z',
            excerpt: 'The official record corrects the announcement date to April 2, 2026.'
          }
        }

        return {
          url,
          title: 'Official announcement record',
          publishedAt: '2026-03-30T00:00:00.000Z',
          excerpt: 'The announcement date is March 30, 2026.'
        }
      }
    }),
    subagentRegistry: createSubagentRegistryService(),
    roleAgentRegistry: null
  })
  const { runtime } = session

  try {
    const started = await runtime.startObjective({
      title: 'Investigate conflicting external records before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check conflicting official records before we answer the user.',
      initiatedBy: 'operator'
    })

    await runtime.requestExternalVerification({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      claim: 'The official source confirms the announcement date is March 30, 2026.',
      query: 'official announcement date correction'
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

test('objective workbench keeps conflicting verification proposals visibly unresolved', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-conflicting-verification-e2e-'))
  await seedConflictingVerificationObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  await page.getByRole('button', { name: 'Objective Workbench' }).click()
  await expect(page.getByRole('heading', { name: 'Objective Workbench' })).toBeVisible()
  await expect(page.getByText('Investigate conflicting external records before responding').first()).toBeVisible()
  await expect(page.getByText('External verification completed', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/under review · workspace/i).first()).toBeVisible()
  await expect(page.getByText('Proposal committed')).toHaveCount(0)

  await electronApp.close()
})
