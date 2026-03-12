import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('approves a safe profile batch and undoes it from review history', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6b3-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6b3-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase6b3.json')

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
      FORGETME_E2E_SAFE_BATCH_FIXTURE: '1',
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()
  await page.getByText('Choose Files').click()
  await expect(page.getByText('chat-phase6b3.json')).toBeVisible({ timeout: 15_000 })

  await page.getByText('Review Workbench').click()
  const groupButton = page.locator('button').filter({ hasText: 'school_name' }).first()
  await expect(groupButton).toBeVisible({ timeout: 15_000 })
  await groupButton.click()
  await expect(page.getByRole('button', { name: 'Batch Approve' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Safe Batch Approval')).toBeVisible()
  await expect(page.getByText('2 items')).toBeVisible()

  await page.getByRole('button', { name: 'Batch Approve' }).click()
  await expect(page.getByRole('button', { name: 'Confirm Batch Approve' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm Batch Approve' }).click()
  await expect(page.getByText('Selected item is no longer pending.')).toBeVisible({ timeout: 15_000 })

  await page.getByText('Review Queue').click()
  const batchRow = page.getByRole('row').filter({ hasText: 'Safe batch approve' })
  await expect(batchRow).toBeVisible({ timeout: 15_000 })
  await expect(batchRow).toContainText('Alice Chen · school_name · 2 items')
  await batchRow.getByRole('button', { name: 'Undo Batch' }).click()
  await expect(batchRow).toContainText('Undone')

  await electronApp.close()
})
