import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { importFixturesThroughPreflight } from './helpers/importFlow'

test('memory workspace persona boundary redirect offers quote-backed follow-ups and sandbox trace', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10c-persona-e2e-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10c-persona-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase10c-persona.json')

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
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()
  await importFixturesThroughPreflight(page, 'chat-phase10c-persona.json')

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Alice Chen$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()

  await page.getByLabel('Ask memory workspace').fill('如果她本人会怎么建议我？请模仿她的口吻回答。')
  await page.getByRole('button', { name: 'Ask' }).click()

  await expect(page.getByText('Persona request blocked')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Past expressions' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reviewed draft sandbox' })).toBeVisible()
  await page.getByRole('button', { name: 'Past expressions' }).click()

  await expect(page.locator('section[aria-label="Turn 2"]')).toBeVisible()
  await expect(page.locator('section[aria-label="Turn 2"]').getByText('Communication Evidence')).toBeVisible()
  await expect(page.locator('section[aria-label="Turn 2"]').getByText('我会继续记下关键细节，归档后就不会丢。')).toBeVisible()

  await page.getByRole('button', { name: 'Reviewed draft sandbox' }).click()

  const sandboxTurn = page.locator('section[aria-label="Turn 3"]')
  await expect(sandboxTurn).toBeVisible()
  await expect(sandboxTurn.getByText('Workflow: persona draft sandbox')).toBeVisible()
  await expect(sandboxTurn.getByText('Simulation draft based on archived expressions. Not a statement from the person.')).toBeVisible()
  await expect(sandboxTurn.getByText('可审阅草稿：先把关键记录整理进归档，把重要细节继续记下来，这样后面查找会更稳妥。')).toBeVisible()
  await expect(sandboxTurn.getByText(/Draft segment 1 stays grounded in Alice Chen excerpt/)).toBeVisible()
  await expect(sandboxTurn.getByText(/Draft segment 2 stays grounded in Alice Chen excerpt/)).toBeVisible()

  await electronApp.close()
})
