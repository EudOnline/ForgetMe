import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('approves a merge candidate and shows the merged result in people view', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase2-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase2-fixtures-'))
  const chatA = path.join(fixtureDir, 'chat-a.json')
  const chatB = path.join(fixtureDir, 'chat-b.json')

  fs.writeFileSync(chatA, JSON.stringify({
    messages: [
      { sender: 'Alice Chen', text: 'hello' },
      { sender: 'Bob', text: 'hi' }
    ]
  }))
  fs.writeFileSync(chatB, JSON.stringify({
    messages: [
      { sender: 'alice chen', text: 'hey' },
      { sender: 'Carol', text: 'yo' }
    ]
  }))

  const electronApp = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: [chatA, chatB].join(path.delimiter),
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()
  await page.getByText('Choose Files').click()
  await page.getByText('Review Queue').click()
  await expect(page.getByText('person_merge_candidate')).toBeVisible()
  await page.getByText('Approve').click()
  await expect(page.getByText('No pending review items.')).toBeVisible()
  await page.getByText('People').click()
  await expect(page.getByRole('button', { name: /^Alice Chen$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^alice chen$/ })).toHaveCount(0)
  await electronApp.close()
})
