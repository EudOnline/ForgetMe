import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { importFixturesThroughPreflight } from './helpers/importFlow'

test('memory workspace sandbox compare flow keeps workflow labels and judge review visible', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10c-sandbox-compare-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10c-sandbox-compare-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase10c-sandbox-compare.json')

  fs.writeFileSync(chatFixture, JSON.stringify({
    messages: [
      { sender: 'Alice Chen', text: '我们还是把这些记录留在归档里，后面查起来更稳妥。' },
      { sender: 'Alice Chen', text: '我会继续记下关键细节，归档后就不会丢。' }
    ]
  }))

  const electronApp = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: chatFixture,
      FORGETME_E2E_MEMORY_COMPARE_FIXTURE: '1',
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()
  await importFixturesThroughPreflight(page, 'chat-phase10c-sandbox-compare.json')

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Alice Chen$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()

  await page.getByLabel('Ask memory workspace').fill('如果她本人会怎么建议我？请模仿她的口吻回答。')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByRole('button', { name: 'Reviewed draft sandbox' })).toBeVisible()

  await page.getByRole('button', { name: 'Reviewed draft sandbox' }).click()
  const sandboxTurn = page.locator('section[aria-label="Turn 2"]')
  await expect(sandboxTurn).toBeVisible()
  await expect(sandboxTurn.getByText('Workflow: persona draft sandbox')).toBeVisible()

  await page.getByLabel('Ask memory workspace').fill('如果她来写这段话，会怎么写？先给我一个可审阅草稿。')
  await page.getByLabel('Enable judge review').check()
  await page.getByRole('button', { name: 'Run compare' }).click()

  const compareResults = page.getByLabel('Compare Results')
  await expect(compareResults.getByRole('heading', { name: 'Compare Results' })).toBeVisible()
  await expect(page.getByLabel('Saved Compare Sessions').getByText('Workflow: persona draft sandbox')).toBeVisible()
  await expect(compareResults.getByText('Workflow: persona draft sandbox').first()).toBeVisible()
  await expect(compareResults.getByText('Judge verdict').first()).toBeVisible()
  await expect(compareResults.getByText('Judge status: completed').first()).toBeVisible()
  await expect(compareResults.getByText('Simulation label preserved').first()).toBeVisible()
  await expect(compareResults.getByText('Review quote trace before reuse').first()).toBeVisible()

  await electronApp.close()
})
