import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('runner executes a queued job and approved profile appears on the person page', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase4-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase4-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase4.json')

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
  await page.getByText('Choose Files').click()
  await expect(page.getByRole('button', { name: 'chat-phase4.json' })).toBeVisible()
  await page.getByText('Enrichment Jobs').click()
  await expect(page.getByText('completed')).toBeVisible({ timeout: 15_000 })
  await page.getByText('Review Queue').click()
  await expect(page.getByText('structured_field_candidate')).toBeVisible({ timeout: 15_000 })
  await page.getByText('Approve').click()
  await page.getByText('People').click()
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByText('Approved Profile')).toBeVisible()
  await expect(page.locator('li').filter({ hasText: '北京大学' }).first()).toBeVisible()
  await electronApp.close()
})
