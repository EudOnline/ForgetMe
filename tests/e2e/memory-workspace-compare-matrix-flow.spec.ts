import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { importFixturesThroughPreflight } from './helpers/importFlow'

test('memory workspace compare matrix runs multiple rows and reopens child compare sessions', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase8d-matrix-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase8d-matrix-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase8d-matrix.json')

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
  await importFixturesThroughPreflight(page, 'chat-phase8d-matrix.json')

  await page.getByRole('button', { name: 'Memory Workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()
  await page.getByLabel('Compare matrix title').fill('Daily matrix')
  await page.getByLabel('Compare matrix rows').fill(
    'Global row | global | 现在最值得优先关注的是什么？\nSecond row | global | 还剩哪些需要复核？'
  )
  await page.getByRole('button', { name: 'Run matrix compare' }).click()

  await expect(page.getByRole('heading', { name: 'Saved Compare Matrices' })).toBeVisible()
  await expect(page.getByText('Rows: 2 · Completed: 2 · Failed: 0')).toBeVisible()
  await expect(page.getByRole('button', { name: /Global row · global · 现在最值得优先关注的是什么？/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Second row · global · 还剩哪些需要复核？/ })).toBeVisible()

  await page.getByRole('button', { name: /Global row · global · 现在最值得优先关注的是什么？/ }).click()
  await expect(page.getByRole('heading', { name: 'Compare Results' })).toBeVisible()
  await expect(page.getByText(/\[fixture siliconflow\]/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Local baseline' })).toBeVisible()

  await electronApp.close()
})
