import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { importFixturesThroughPreflight } from './helpers/importFlow'

test('opens a structured-field review item in the workbench and refreshes approve/undo state', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase5-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase5-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase5.json')

  fs.writeFileSync(chatFixture, JSON.stringify({
    messages: [
      { sender: 'Alice Chen', text: 'hello' }
    ]
  }))

  const electronApp = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: chatFixture,
      FORGETME_E2E_RUNNER_PROFILE_FIXTURE: '1',
      FORGETME_ENRICHMENT_RUNNER_INTERVAL_MS: '100',
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()
  await importFixturesThroughPreflight(page, 'chat-phase5.json')
  await page.getByRole('button', { name: 'Enrichment Jobs' }).click()
  await expect(page.getByText('completed')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Review Workbench' }).click()
  await expect(page.getByText('Impact Preview')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: '北京大学' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()

  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Selected item is no longer pending.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()

  await electronApp.close()
})
