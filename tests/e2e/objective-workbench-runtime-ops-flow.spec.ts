import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, _electron as electron } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { createExternalVerificationBrokerService } from '../../src/main/services/externalVerificationBrokerService'
import { createObjectiveModule } from '../../src/main/modules/objective/runtime/createObjectiveModule'
import { createSubagentRegistryService } from '../../src/main/services/subagentRegistryService'

async function seedRuntimeOpsObjective(userDataDir: string) {
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
    roleAgentRegistry: null
  })
  const { runtime } = session

  try {
    const started = await runtime.startObjective({
      title: 'Replay a runtime ops incident',
      objectiveKind: 'publication',
      prompt: 'Surface a seeded incident and let the operator persist a runtime kill switch.',
      initiatedBy: 'operator'
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'publish_draft',
      payload: {
        destination: 'public_share'
      },
      ownerRole: 'workspace',
      requiredApprovals: ['workspace']
    })

    await runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'workspace',
      response: 'approve',
      comment: 'Owner approved the publication request.'
    })

    return {
      objectiveId: started.objective.objectiveId,
      title: started.objective.title
    }
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

test('objective workbench exposes runtime health, incidents, and persisted runtime controls', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-runtime-ops-e2e-'))
  const seeded = await seedRuntimeOpsObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  try {
    await page.getByRole('button', { name: 'Objective Workbench' }).click()
    await expect(page.getByRole('heading', { name: 'Objective Workbench' })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(seeded.title) })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Runtime health' })).toBeVisible()
    await expect(page.getByText('Operator-gated proposals')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Recent incidents' })).toBeVisible()
    await expect(page.getByText('proposal_awaiting_operator')).toBeVisible()
    await page.getByText('proposal_awaiting_operator').click()
    await expect(page.getByText('proposalKind: publish_draft')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Runtime controls' })).toBeVisible()
    await page.getByLabel('Disable auto commit').check()
    await page.getByRole('button', { name: 'Refresh objectives' }).click()
    await expect(page.getByLabel('Disable auto commit')).toBeChecked()
  } finally {
    await electronApp.close()
  }
})
