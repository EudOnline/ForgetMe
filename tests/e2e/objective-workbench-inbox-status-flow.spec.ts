import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { createExternalVerificationBrokerService } from '../../src/main/services/externalVerificationBrokerService'
import { createObjectiveModule } from '../../src/main/modules/objective/runtime/createObjectiveModule'
import { createSubagentRegistryService } from '../../src/main/services/subagentRegistryService'

async function seedVetoedPublicationObjective(userDataDir: string) {
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
      title: 'Inbox diagnostics should surface row-level blockers',
      objectiveKind: 'publication',
      prompt: 'Show summary row pills for awaiting, blocked, vetoed, and latest blocker.',
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
      comment: 'Owner approved for release.'
    })
    await runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'governance',
      response: 'veto',
      comment: 'Governance veto pending policy alignment.'
    })

    return {
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

test('objective inbox rows show awaiting/blocking diagnostics without opening objective detail', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-inbox-status-e2e-'))
  const seeded = await seedVetoedPublicationObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  try {
    await page.getByRole('button', { name: 'Objective Workbench' }).click()
    await expect(page.getByRole('heading', { name: 'Objective Workbench' })).toBeVisible()

    const objectiveButton = page.getByRole('button', { name: new RegExp(seeded.title) })

    await expect(objectiveButton).toContainText('Needs operator')
    await expect(objectiveButton).toContainText('Awaiting operator: 1')
    await expect(objectiveButton).toContainText('Blocked: 1')
    await expect(objectiveButton).toContainText('Vetoed: 1')
    await expect(objectiveButton).toContainText('Latest blocker: Blocked by governance: Governance veto pending policy alignment.')
  } finally {
    await electronApp.close()
  }
})
