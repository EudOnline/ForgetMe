import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('shows provider boundary audit for a seeded multimodal job', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6a2-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6a2-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase6a2.json')

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
  await expect(page.getByRole('button', { name: 'chat-phase6a2.json' })).toBeVisible()

  await page.getByText('Enrichment Jobs').click()
  await expect(page.getByText('completed')).toBeVisible()
  await page.getByRole('button', { name: 'Boundary' }).click()

  await expect(page.getByRole('heading', { name: 'Provider Boundary Audit' })).toBeVisible()
  await expect(page.getByText('document_ocr.remote_baseline')).toBeVisible()
  await expect(page.locator('p').filter({ hasText: /vault:\/\/file\// }).first()).toBeVisible()
  await expect(page.getByText(/frozenPath/)).toBeVisible()

  await electronApp.close()
})
