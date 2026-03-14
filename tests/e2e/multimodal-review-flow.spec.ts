import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('reviews a high-risk OCR field and shows it on the person profile', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase3-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase3-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase3.json')

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
      FORGETME_E2E_MULTIMODAL_FIXTURE: '1',
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()
  await page.getByText('Choose Files').click()
  await page.getByText('Review Queue').click()
  await expect(page.getByText('structured_field_candidate')).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).first().click()
  await page.getByText('People').click()
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await expect(page.locator('li').filter({ hasText: '北京大学' }).first()).toBeVisible()
  await electronApp.close()
})
