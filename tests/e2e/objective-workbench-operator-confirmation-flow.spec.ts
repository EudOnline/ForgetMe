import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { createExternalVerificationBrokerService } from '../../src/main/services/externalVerificationBrokerService'
import { createObjectiveModule } from '../../src/main/modules/objective/runtime/createObjectiveModule'
import { createSubagentRegistryService } from '../../src/main/services/subagentRegistryService'

async function seedAutoCommitObjective(userDataDir: string) {
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
      title: 'Auto-commit a review action after owner approval',
      objectiveKind: 'review_decision',
      prompt: 'Allow the owner to approve a reversible review action without operator intervention.',
      initiatedBy: 'operator'
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'review',
      proposalKind: 'approve_review_item',
      payload: { queueItemId: 'rq-auto-commit-e2e' },
      ownerRole: 'review',
      requiresOperatorConfirmation: true
    })

    return {
      objectiveId: started.objective.objectiveId,
      proposalId: proposal.proposalId,
      title: started.objective.title
    }
  } finally {
    session.close()
  }
}

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
      title: 'Gate a public publication until operator confirmation',
      objectiveKind: 'publication',
      prompt: 'Require explicit operator confirmation before publishing this draft to a public share destination.',
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

    return {
      objectiveId: started.objective.objectiveId,
      proposalId: proposal.proposalId,
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

async function openSeededObjective(page: Page, title: string) {
  await page.getByRole('button', { name: 'Objective Workbench' }).click()
  await expect(page.getByRole('heading', { name: 'Objective Workbench' })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(title) }).click()
}

test('objective workbench auto-commits medium-risk proposals immediately after owner approval', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-auto-commit-e2e-'))
  const seeded = await seedAutoCommitObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  try {
    await openSeededObjective(page, seeded.title)

    const beforeStatus = await readProposalStatus(page, seeded)
    expect(beforeStatus).toBe('under_review')

    await expect(page.getByText('Proposal risk: medium')).toBeVisible()
    await expect(page.getByText('Autonomy decision: auto commit with audit')).toBeVisible()

    await page.getByRole('button', { name: 'Approve as owner' }).click()
    await expect(page.getByText('Proposal committed')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm proposal' })).toHaveCount(0)

    const afterStatus = await readProposalStatus(page, seeded)
    expect(afterStatus).toBe('committed')
  } finally {
    await electronApp.close()
  }
})

test('objective workbench only commits critical publication proposals after operator confirmation', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-confirmation-e2e-'))
  const seeded = await seedAwaitingOperatorObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  try {
    await openSeededObjective(page, seeded.title)

    const beforeStatus = await readProposalStatus(page, seeded)
    expect(beforeStatus).toBe('under_review')

    await expect(page.getByText('Proposal risk: critical')).toBeVisible()
    await expect(page.getByText('Autonomy decision: await operator')).toBeVisible()

    await page.getByRole('button', { name: 'Approve as owner' }).click()
    await expect(page.getByRole('button', { name: 'Confirm proposal' })).toBeVisible()
    await expect(page.getByText('Proposal committed')).toHaveCount(0)

    const gatedStatus = await readProposalStatus(page, seeded)
    expect(gatedStatus).toBe('awaiting_operator')

    await page.getByRole('button', { name: 'Confirm proposal' }).click()
    await expect(page.getByText('Proposal committed')).toBeVisible()

    const afterStatus = await readProposalStatus(page, seeded)
    expect(afterStatus).toBe('committed')
  } finally {
    await electronApp.close()
  }
})

test('objective workbench keeps critical publication proposals uncommitted when the operator blocks them', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-blocked-confirmation-e2e-'))
  const seeded = await seedAwaitingOperatorObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  try {
    await openSeededObjective(page, seeded.title)

    await page.getByRole('button', { name: 'Approve as owner' }).click()
    await expect(page.getByRole('button', { name: 'Block proposal' })).toBeVisible()

    const gatedStatus = await readProposalStatus(page, seeded)
    expect(gatedStatus).toBe('awaiting_operator')

    await page.getByRole('button', { name: 'Block proposal' }).click()
    await expect(page.getByText('Proposal blocked', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Blocked by operator: Operator blocked until the objective is clarified.').first()).toBeVisible()
    await expect(page.getByText('Proposal committed')).toHaveCount(0)

    const blockedStatus = await readProposalStatus(page, seeded)
    expect(blockedStatus).toBe('blocked')
  } finally {
    await electronApp.close()
  }
})

test('objective workbench keeps critical publication proposals uncommitted when governance vetoes them', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-vetoed-confirmation-e2e-'))
  const seeded = await seedAwaitingOperatorObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  try {
    await openSeededObjective(page, seeded.title)

    const beforeStatus = await readProposalStatus(page, seeded)
    expect(beforeStatus).toBe('under_review')

    await page.getByRole('button', { name: 'Veto as governance' }).click()
    await expect(page.getByText('Veto issued', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Blocked by governance: Governance veto pending policy alignment.').first()).toBeVisible()
    await expect(page.getByText('Proposal committed')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Confirm proposal' })).toHaveCount(0)

    const vetoedStatus = await readProposalStatus(page, seeded)
    expect(vetoedStatus).toBe('vetoed')
  } finally {
    await electronApp.close()
  }
})
