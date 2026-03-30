import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { importFixturesThroughPreflight } from './helpers/importFlow'

test('opens a group portrait from the person dossier', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase7c-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase7c-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase7c.json')

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
  await importFixturesThroughPreflight(page, 'chat-phase7c.json')

  await page.getByRole('button', { name: 'Group Portrait', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Group Portraits' })).toBeVisible()
  await expect(page.getByText('Alice Chen Group Portrait')).toBeVisible()
  await page.getByRole('button', { name: 'Open Alice Chen Group Portrait' }).click()
  await expect(page.getByRole('heading', { name: 'Group Portrait' })).toBeVisible()
  await expect(page.getByText('Alice Chen Group Portrait')).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()
  await page.getByLabel('Ask memory workspace').fill('这个群体最近一起发生过什么？')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace · Alice Chen Group' })).toBeVisible()
  await expect(page.getByText('Timeline Windows')).toBeVisible()
  await expect(page.getByText('Summary')).toBeVisible()
  await expect(page.getByLabel('Timeline Windows').getByText(/Trip planning/)).toBeVisible()
  await expect(page.getByText('Saved Sessions')).toBeVisible()
  await expect(page.getByRole('button', { name: /Memory Workspace · Alice Chen Group · 这个群体最近一起发生过什么？/ })).toBeVisible()

  await page.getByRole('button', { name: 'Group Portrait', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Group Portraits' })).toBeVisible()
  await page.getByRole('button', { name: 'Open Alice Chen Group Portrait' }).click()
  await expect(page.getByRole('heading', { name: 'Group Portrait' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()
  await expect(page.getByText('Saved Sessions')).toBeVisible()
  await expect(page.locator('section[aria-label="Turn 1"]')).toBeVisible()
  await expect(page.getByText('Timeline Windows')).toBeVisible()
  await expect(page.getByLabel('Timeline Windows').getByRole('button', { name: 'chat-phase7c.json' })).toBeVisible()
  await page.getByLabel('Timeline Windows').getByRole('button', { name: 'chat-phase7c.json' }).click()
  await expect(page.getByRole('heading', { name: 'Document Evidence' })).toBeVisible()
  await expect(page.getByText('chat-phase7c.json')).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Alice Chen$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()

  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()
  await page.getByLabel('Ask memory workspace').fill('她有哪些已保存的资料？')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace · Alice Chen' })).toBeVisible()
  await expect(page.getByText('Summary')).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Alice Chen$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open group portrait' }).click()

  await expect(page.getByRole('heading', { name: 'Group Portrait' })).toBeVisible()
  await expect(page.getByText('Alice Chen Group Portrait')).toBeVisible()
  await expect(page.getByText('Relationship Density')).toBeVisible()
  await expect(page.getByText('1 / 1')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Shared Events' }).getByText(/Trip planning/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Timeline Windows' })).toBeVisible()
  await expect(page.getByText(/1 events · 2 members/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()
  await expect(page.getByText(/Alice Chen anchors a 2-person group with Bob Li\./)).toBeVisible()
  await expect(page.getByText('Shared Evidence Sources')).toBeVisible()
  await page.getByRole('button', { name: 'Open member Bob Li' }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await expect(page.getByText('Bob Li')).toBeVisible()

  await page.getByRole('button', { name: 'Open group portrait' }).click()
  await expect(page.getByRole('heading', { name: 'Group Portrait' })).toBeVisible()
  await expect(page.getByText('Pending review: 2')).toBeVisible()
  await expect(page.getByText('Conflict groups: 1')).toBeVisible()
  await expect(page.locator('li').filter({ hasText: 'Bob Li' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Open school_name conflicts' }).click()
  await expect(page.getByRole('heading', { name: 'Review Workbench' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bob Li' })).toBeVisible()

  await page.getByRole('button', { name: 'Group Portrait' }).click()
  await expect(page.getByRole('heading', { name: 'Group Portraits' })).toBeVisible()
  await page.getByRole('button', { name: 'Open Bob Li Group Portrait' }).click()
  await expect(page.getByRole('heading', { name: 'Group Portrait' })).toBeVisible()
  await page.getByRole('button', { name: 'Safe batch approve · Bob Li · school_name · 2 items' }).click()
  await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Replay Detail' })).toBeVisible()
  await expect(page.getByLabel('Search history')).toHaveValue('journal-group-1')

  await electronApp.close()
})
