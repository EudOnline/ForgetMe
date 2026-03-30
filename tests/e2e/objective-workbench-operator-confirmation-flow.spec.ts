import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../src/main/services/db'
import { createFacilitatorAgentService } from '../../src/main/services/agents/facilitatorAgentService'
import { createExternalVerificationBrokerService } from '../../src/main/services/externalVerificationBrokerService'
import { createObjectiveRuntimeService } from '../../src/main/services/objectiveRuntimeService'
import { createSubagentRegistryService } from '../../src/main/services/subagentRegistryService'

function seedAwaitingOperatorObjective(userDataDir: string) {
  const appPaths = ensureAppPaths(userDataDir)
  const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
  runMigrations(db)

  const runtime = createObjectiveRuntimeService({
    db,
    facilitator: createFacilitatorAgentService(),
    externalVerificationBroker: createExternalVerificationBrokerService({
      searchWeb: async () => [],
      openSourcePage: async ({ url }) => ({
        url,
        title: null,
        publishedAt: null,
        excerpt: ''
      })
    }),
    subagentRegistry: createSubagentRegistryService()
  })

  const started = runtime.startObjective({
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

  runtime.respondToAgentProposal({
    proposalId: proposal.proposalId,
    responderRole: 'review',
    response: 'approve',
    comment: 'Owner approved this review action.'
  })

  db.close()

  return {
    objectiveId: started.objective.objectiveId,
    proposalId: proposal.proposalId
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
  return page.evaluate(async ({ objectiveId, proposalId }) => {
    const archiveApi = (window as typeof window & {
      archiveApi?: {
        getAgentObjective: (payload: { objectiveId: string }) => Promise<{
          proposals: Array<{ proposalId: string; status: string }>
        } | null>
      }
      require?: (moduleName: string) => {
        ipcRenderer?: {
          invoke: (channel: string, payload: { objectiveId: string }) => Promise<{
            proposals: Array<{ proposalId: string; status: string }>
          } | null>
        }
      }
    }).archiveApi

    if (archiveApi) {
      const objective = await archiveApi.getAgentObjective({ objectiveId })
      return objective?.proposals.find((proposal) => proposal.proposalId === proposalId)?.status ?? null
    }

    const electronModule = window.require?.('electron')
    const ipcRenderer = electronModule?.ipcRenderer
    if (!ipcRenderer) {
      return null
    }

    const objective = await ipcRenderer.invoke('archive:getAgentObjective', { objectiveId })
    return objective?.proposals.find((proposal: { proposalId: string; status: string }) => proposal.proposalId === proposalId)?.status ?? null
  }, input)
}

test('objective workbench only commits a gated proposal after operator confirmation', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-confirmation-e2e-'))
  const seeded = seedAwaitingOperatorObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  await page.getByRole('button', { name: 'Objective Workbench' }).click()
  await expect(page.getByRole('heading', { name: 'Objective Workbench' })).toBeVisible()
  await expect(page.getByText('Awaiting operator confirmation', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Proposal committed')).toHaveCount(0)

  const beforeStatus = await readProposalStatus(page, seeded)
  expect(beforeStatus).toBe('awaiting_operator')

  await page.getByRole('button', { name: 'Confirm proposal' }).click()
  await expect(page.getByText('Proposal committed')).toBeVisible()

  const afterStatus = await readProposalStatus(page, seeded)
  expect(afterStatus).toBe('committed')

  await electronApp.close()
})
