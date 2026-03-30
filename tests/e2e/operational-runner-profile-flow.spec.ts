import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { importFixturesThroughPreflight } from './helpers/importFlow'

test('runner executes a queued job and dossier baseline appears on the person page', async () => {
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
  await importFixturesThroughPreflight(page, 'chat-phase4.json')
  await page.getByRole('button', { name: 'Enrichment Jobs' }).click()
  await expect(page.getByRole('cell', { name: 'completed' }).first()).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Review Queue' }).click()
  await expect(page.getByText('structured_field_candidate')).toBeVisible({ timeout: 15_000 })
  await page.getByText('Approve').click()
  await page.getByRole('button', { name: 'People' }).click()
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await expect(page.getByText('Thematic Portrait')).toBeVisible()
  await expect(page.getByText('Evidence Backtrace')).toBeVisible()
  await expect(page.locator('li').filter({ hasText: '北京大学' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace' })).toBeVisible()
  await page.getByLabel('Ask memory workspace').fill('她有哪些已批准的资料？')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace · Alice Chen' })).toBeVisible()
  await expect(page.getByLabel('Summary')).toBeVisible()
  await expect(page.getByLabel('Answer').getByText(/school_name: 北京大学/)).toBeVisible()
  await electronApp.close()
})

test('dossier conflict shortcut opens the matching workbench conflict group', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase7b-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase7b-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase7b.json')

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
      FORGETME_E2E_DOSSIER_CONFLICT_FIXTURE: '1',
      FORGETME_ENRICHMENT_RUNNER_INTERVAL_MS: '100',
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()
  await importFixturesThroughPreflight(page, 'chat-phase7b.json')
  await page.getByRole('button', { name: 'Enrichment Jobs' }).click()
  await expect(page.getByRole('cell', { name: 'completed' })).toHaveCount(2, { timeout: 15_000 })

  await page.getByRole('button', { name: 'Review Workbench' }).click()
  await expect(page.getByRole('button', { name: '北京大学' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: '北京大学' }).click()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByRole('button', { name: '清华大学' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 })

  await page.getByRole('button', { name: 'People' }).click()
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await expect(page.getByText('Conflicts & Gaps')).toBeVisible()
  await expect(page.getByText(/School Name conflict/)).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace' })).toBeVisible()
  await page.getByLabel('Ask memory workspace').fill('她现在有哪些还没解决的冲突？')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace · Alice Chen' })).toBeVisible()
  await expect(page.getByText('Conflicts & Gaps')).toBeVisible()
  await expect(page.getByLabel('Conflicts & Gaps').locator('p').filter({ hasText: /Open conflicts: school_name/ })).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open school_name conflicts' }).click()

  await expect(page.getByRole('heading', { name: 'Review Workbench' })).toBeVisible()
  await expect(page.getByText('Conflict Compare')).toBeVisible()
  await expect(page.getByRole('button', { name: 'school_name' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '清华大学' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('清华大学 · 1')).toBeVisible()

  await electronApp.close()
})
