import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { importFixturesThroughPreflight } from './helpers/importFlow'

test('memory workspace advice compare and matrix flows preserve advice mode labels', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase9b-advice-compare-e2e-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase9b-advice-compare-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase9b-advice-compare.json')

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
      FORGETME_E2E_MEMORY_COMPARE_FIXTURE: '1',
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()
  await importFixturesThroughPreflight(page, 'chat-phase9b-advice-compare.json')

  await page.getByRole('button', { name: 'Memory Workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()

  await page.getByLabel('Response mode').selectOption('advice')
  await page.getByLabel('Ask memory workspace').fill('现在最值得优先关注的是什么？')
  await page.getByRole('button', { name: 'Run compare' }).click()

  await expect(page.getByRole('heading', { name: 'Compare Results' })).toBeVisible()
  await expect(page.getByLabel('Saved Compare Sessions').getByText('Mode: advice')).toBeVisible()
  await expect(page.getByLabel('Compare Results').getByText('Mode: advice').first()).toBeVisible()
  await expect(page.getByText(/\[fixture siliconflow\]/)).toBeVisible()

  await page.getByLabel('Compare matrix title').fill('Advice matrix')
  await page.getByLabel('Compare matrix rows').fill('Advice row | global | 现在最值得优先关注的是什么？')
  await page.getByRole('button', { name: 'Run matrix compare' }).click()

  await expect(page.getByLabel('Saved Compare Matrices').getByText('Mode: advice')).toBeVisible()
  await page.getByRole('button', { name: /Advice row · global · 现在最值得优先关注的是什么？/ }).click()
  await expect(page.getByLabel('Compare Results').getByText('Mode: advice').first()).toBeVisible()

  await electronApp.close()
})
