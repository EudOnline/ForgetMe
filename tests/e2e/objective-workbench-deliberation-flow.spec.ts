import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../src/main/services/db'
import { createFacilitatorAgentService } from '../../src/main/services/agents/facilitatorAgentService'
import { createExternalVerificationBrokerService } from '../../src/main/services/externalVerificationBrokerService'
import { createObjectiveRuntimeService } from '../../src/main/services/objectiveRuntimeService'
import { createSubagentRegistryService } from '../../src/main/services/subagentRegistryService'

async function seedDeliberationObjective(userDataDir: string) {
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

  const started = await runtime.startObjective({
    title: 'Review whether approval is safe',
    objectiveKind: 'review_decision',
    prompt: 'Decide whether approval is safe and whether we need more evidence.',
    initiatedBy: 'operator'
  })

  const proposal = runtime.createProposal({
    objectiveId: started.objective.objectiveId,
    threadId: started.mainThread.threadId,
    proposedByParticipantId: 'review',
    proposalKind: 'approve_review_item',
    payload: { queueItemId: 'rq-deliberation-e2e' },
    ownerRole: 'review',
    requiresOperatorConfirmation: true
  })

  runtime.raiseBlockingChallenge({
    objectiveId: started.objective.objectiveId,
    threadId: started.mainThread.threadId,
    proposalId: proposal.proposalId,
    fromParticipantId: 'governance',
    body: 'Need stronger evidence before this can proceed.'
  })

  db.close()
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

test('objective workbench shows deliberation checkpoints and agent stances', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-deliberation-e2e-'))
  await seedDeliberationObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  await page.getByRole('button', { name: 'Objective Workbench' }).click()
  await expect(page.getByRole('heading', { name: 'Objective Workbench' })).toBeVisible()
  await expect(page.getByText('Review whether approval is safe').first()).toBeVisible()
  await expect(page.getByText('Goal accepted', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Participants invited', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Challenge raised', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Need stronger evidence before this can proceed.').first()).toBeVisible()
  await expect(page.getByText('review', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('workspace', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('governance', { exact: true }).first()).toBeVisible()

  await electronApp.close()
})
