import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { createExternalVerificationBrokerService } from '../../src/main/services/externalVerificationBrokerService'
import { createObjectiveModule } from '../../src/main/modules/objective/runtime/createObjectiveModule'
import { createSubagentRegistryService } from '../../src/main/services/subagentRegistryService'

async function seedAwaitingOperatorObjective(userDataDir: string) {
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
      title: 'Confirm a review action before commit',
      objectiveKind: 'review_decision',
      prompt: 'Hold the review action until an operator confirms it.',
      initiatedBy: 'operator'
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'review',
      proposalKind: 'approve_review_item',
      payload: { queueItemId: 'rq-operator-confirmation-e2e' },
      ownerRole: 'review',
      requiresOperatorConfirmation: true
    })

    await runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'review',
      response: 'approve',
      comment: 'Owner approved this review action.'
    })

    return {
      objectiveId: started.objective.objectiveId,
      proposalId: proposal.proposalId
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

async function readProposalStatus(page: Page, input: {
  objectiveId: string
  proposalId: string
}) {
  await page.waitForFunction(() => {
    return Boolean((window as typeof window & { archiveApi?: unknown }).archiveApi)
  })

  return page.evaluate(async ({ objectiveId, proposalId }) => {
    const archiveApi = (window as typeof window & {
      archiveApi?: {
        getAgentObjective: (payload: { objectiveId: string }) => Promise<{
          proposals: Array<{ proposalId: string; status: string }>
        } | null>
      }
    }).archiveApi

    if (!archiveApi) {
      return null
    }

    const objective = await archiveApi.getAgentObjective({ objectiveId })
    return objective?.proposals.find((proposal: { proposalId: string; status: string }) => proposal.proposalId === proposalId)?.status ?? null
  }, input)
}

test('objective workbench only commits a gated proposal after operator confirmation', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-confirmation-e2e-'))
  const seeded = await seedAwaitingOperatorObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  await page.getByRole('button', { name: 'Objective Workbench' }).click()
  await expect(page.getByRole('heading', { name: 'Objective Workbench' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Confirm a review action before commit/ })).toBeVisible()
  await page.getByRole('button', { name: /Confirm a review action before commit/ }).click()
  await expect(page.getByRole('button', { name: 'Confirm proposal' })).toBeVisible()
  await expect(page.getByText('Proposal committed')).toHaveCount(0)

  const beforeStatus = await readProposalStatus(page, seeded)
  expect(beforeStatus).toBe('awaiting_operator')

  await page.getByRole('button', { name: 'Confirm proposal' }).click()
  await expect(page.getByText('Proposal committed')).toBeVisible()

  const afterStatus = await readProposalStatus(page, seeded)
  expect(afterStatus).toBe('committed')

  await electronApp.close()
})
