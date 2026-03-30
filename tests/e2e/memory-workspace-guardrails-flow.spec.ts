import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { importFixturesThroughPreflight } from './helpers/importFlow'

test('shows memory workspace guardrails for conflict-first and persona fallback asks', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase8d-e2e-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase8d-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase8d.json')

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
  await importFixturesThroughPreflight(page, 'chat-phase8d.json')

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Bob Li$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Bob Li$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()
  await page.getByLabel('Ask memory workspace').fill('她现在有哪些还没解决的冲突？')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace · Bob Li' })).toBeVisible()
  await expect(page.getByText('Guardrails')).toBeVisible()
  await expect(page.getByText('fallback_to_conflict')).toBeVisible()
  await expect(page.getByText('open_conflict_present')).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Alice Chen$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()
  await page.getByLabel('Ask memory workspace').fill('如果她本人会怎么建议我？请模仿她的口吻回答。')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace · Alice Chen' })).toBeVisible()
  await expect(page.getByText('fallback_unsupported_request')).toBeVisible()
  await expect(page.getByLabel('Answer').getByText(/cannot answer as if it were the archived person/i)).toBeVisible()

  await electronApp.close()
})
