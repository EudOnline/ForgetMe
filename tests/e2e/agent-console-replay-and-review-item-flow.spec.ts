import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

type LaunchInput = {
  chatFixture: string
  userDataDir: string
}

async function launchApp(input: LaunchInput) {
  return electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: input.chatFixture,
      FORGETME_E2E_RUNNER_PROFILE_FIXTURE: '1',
      FORGETME_ENRICHMENT_RUNNER_INTERVAL_MS: '100',
      FORGETME_E2E_USER_DATA_DIR: input.userDataDir
    }
  })
}

test('agent console confirmation-gates destructive review item actions and replays persisted run metadata after relaunch', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-console-replay-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-console-replay-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-agent-console-replay.json')

  fs.writeFileSync(chatFixture, JSON.stringify({
    messages: [
      { sender: 'Alice Chen', text: 'hello' }
    ]
  }))

  let electronApp = await launchApp({
    chatFixture,
    userDataDir
  })
  let page = await electronApp.firstWindow()

  await page.getByText('Choose Files').click()
  await expect(page.getByRole('button', { name: 'chat-agent-console-replay.json' })).toBeVisible()

  await page.getByRole('button', { name: 'Enrichment Jobs' }).click()
  await expect(page.getByText('completed')).toBeVisible({ timeout: 15_000 })

  const queueItemId = await page.evaluate(async () => {
    const archiveApi = (
      window as typeof window & {
        archiveApi?: {
          listReviewWorkbenchItems: (input: { status: 'pending' }) => Promise<Array<{ queueItemId: string }>>
        }
      }
    ).archiveApi

    if (archiveApi) {
      const items = await archiveApi.listReviewWorkbenchItems({ status: 'pending' })
      return items[0]?.queueItemId ?? null
    }

    const electronModule = window.require?.('electron')
    const ipcRenderer = electronModule?.ipcRenderer
    if (!ipcRenderer) {
      return null
    }

    const items = await ipcRenderer.invoke('archive:listReviewWorkbenchItems', { status: 'pending' })
    return items[0]?.queueItemId ?? null
  })
  expect(queueItemId).toBeTruthy()

  await page.getByRole('button', { name: 'Agent Console' }).click()
  await expect(page.getByRole('heading', { name: 'Agent Console' })).toBeVisible()
  await page.getByLabel('Role override').selectOption('review')
  await page.getByLabel('Agent prompt').fill(`Approve review item ${queueItemId}`)
  await page.getByRole('button', { name: 'Run agent task' }).click()

  await expect(page.getByText('Confirmation token required before applying this review action.')).toBeVisible()
  await expect(page.getByText(`Approved review item ${queueItemId}.`)).toHaveCount(0)

  await page.getByLabel('Confirmation token').fill('confirm-item-action-1')
  await page.getByRole('button', { name: 'Run confirmed action' }).click()

  await expect(page.getByText(`Approved review item ${queueItemId}.`).first()).toBeVisible()
  await expect(page.getByText('Assigned roles: review').first()).toBeVisible()

  await page.getByRole('button', { name: 'Review Queue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible()
  await page.getByRole('button', { name: 'Agent Console' }).click()
  await expect(page.getByText(`Approved review item ${queueItemId}.`).first()).toBeVisible()
  await expect(page.getByText('Assigned roles: review').first()).toBeVisible()

  await electronApp.close()

  electronApp = await launchApp({
    chatFixture,
    userDataDir
  })
  page = await electronApp.firstWindow()

  await page.getByRole('button', { name: 'Agent Console' }).click()
  await expect(page.getByRole('heading', { name: 'Agent Console' })).toBeVisible()
  await expect(page.getByText(`Approved review item ${queueItemId}.`).first()).toBeVisible()
  await expect(page.getByText('Assigned roles: review').first()).toBeVisible()

  await electronApp.close()
})
