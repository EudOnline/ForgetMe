import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('memory workspace supports global, person, and group scoped asks', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase8a-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase8a-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase8a.json')

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
  await expect(page.getByRole('button', { name: 'chat-phase8a.json' })).toBeVisible()

  await page.getByRole('button', { name: 'Memory Workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ask' })).toBeDisabled()
  await page.getByLabel('Ask memory workspace').fill('现在最值得优先关注的是什么？')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace · Global' })).toBeVisible()
  await expect(page.getByText('Review Pressure')).toBeVisible()
  await expect(page.getByLabel('Answer').getByText(/pending review items remain/)).toBeVisible()
  await expect(page.getByText('Saved Sessions')).toBeVisible()
  await expect(page.getByRole('button', { name: /Memory Workspace · Global · 现在最值得优先关注的是什么？/ })).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Bob Li$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Bob Li$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()
  await page.getByLabel('Ask memory workspace').fill('她现在有哪些还没解决的冲突？')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace · Bob Li' })).toBeVisible()
  await expect(page.getByText('Conflicts & Gaps')).toBeVisible()
  await expect(page.getByLabel('Conflicts & Gaps').locator('p').filter({ hasText: /Open conflicts: school_name/ })).toBeVisible()
  await expect(page.getByLabel('Conflicts & Gaps').getByRole('button', { name: 'Open school_name conflicts' })).toBeVisible()
  await expect(page.getByText('Saved Sessions')).toBeVisible()
  await expect(page.getByRole('button', { name: /Memory Workspace · Bob Li · 她现在有哪些还没解决的冲突？/ })).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Bob Li$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Bob Li$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByText('Saved Sessions')).toBeVisible()
  await expect(page.locator('section[aria-label=\"Turn 1\"]')).toBeVisible()
  await expect(page.getByText('Conflicts & Gaps')).toBeVisible()
  await page.getByLabel('Conflicts & Gaps').getByRole('button', { name: 'Open school_name conflicts' }).click()
  await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible()
  await expect(page.getByLabel('Search history')).not.toHaveValue('')

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Bob Li$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Bob Li$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await page.getByLabel('Ask memory workspace').fill('她现在有哪些还没解决的冲突？')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.locator('section[aria-label=\"Turn 1\"]')).toBeVisible()
  await expect(page.locator('section[aria-label=\"Turn 2\"]')).toBeVisible()

  await page.getByRole('button', { name: 'Group Portrait', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Group Portraits' })).toBeVisible()
  await page.getByRole('button', { name: 'Open Alice Chen Group Portrait' }).click()
  await expect(page.getByRole('heading', { name: 'Group Portrait' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()
  await page.getByLabel('Ask memory workspace').fill('这个群体最近一起发生过什么？')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace · Alice Chen Group' })).toBeVisible()
  await expect(page.getByText('Timeline Windows')).toBeVisible()
  await expect(page.getByText('Summary')).toBeVisible()
  await expect(page.getByLabel('Timeline Windows').getByText(/Trip planning/)).toBeVisible()
  await expect(page.getByLabel('Timeline Windows').getByRole('button', { name: 'chat-phase8a.json' })).toBeVisible()

  await electronApp.close()
})
