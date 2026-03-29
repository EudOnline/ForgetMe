import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('agent console runs review and workspace tasks and links back into existing surfaces', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-console-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-console-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-agent-console.json')

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
      FORGETME_E2E_GROUP_PORTRAIT_FIXTURE: '1',
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()
  await page.getByText('Choose Files').click()
  await expect(page.getByRole('button', { name: 'chat-agent-console.json' })).toBeVisible()

  await page.getByRole('button', { name: 'Agent Console' }).click()
  await expect(page.getByRole('heading', { name: 'Agent Console' })).toBeVisible()

  await page.getByLabel('Agent prompt').fill('Summarize the highest-priority pending review work')
  await page.getByRole('button', { name: 'Run agent task' }).click()
  await expect(page.getByText('Assigned roles: orchestrator, review').first()).toBeVisible()
  await expect(page.getByText(/pending items across .* conflict groups/i).first()).toBeVisible()
  await page.getByRole('button', { name: 'Open Review Queue' }).click()
  await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible()

  await page.getByRole('button', { name: 'Agent Console' }).click()
  await expect(page.getByRole('heading', { name: 'Agent Console' })).toBeVisible()
  await page.getByLabel('Role override').selectOption('workspace')
  await page.getByLabel('Agent prompt').fill('What should I look at in the archive right now?')
  await page.getByRole('button', { name: 'Run agent task' }).click()
  await expect(page.getByText('Assigned roles: workspace').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Memory Workspace' })).toBeVisible()
  await page.getByRole('button', { name: 'Open Memory Workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()

  await electronApp.close()
})
