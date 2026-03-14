import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('memory workspace compare runner renders fixture-backed compare results', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase8d-compare-e2e-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase8d-compare-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase8d-compare.json')

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
  await page.getByText('Choose Files').click()
  await expect(page.getByRole('button', { name: 'chat-phase8d-compare.json' })).toBeVisible()

  await page.getByRole('button', { name: 'Memory Workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()
  await expect(page.getByLabel('Include local baseline')).toBeChecked()
  await expect(page.getByLabel('Include SiliconFlow target')).toBeChecked()
  await expect(page.getByLabel('Include OpenRouter target')).toBeChecked()
  await page.getByLabel('Include OpenRouter target').uncheck()
  await page.getByLabel('Enable judge review').check()
  await page.getByLabel('Ask memory workspace').fill('现在最值得优先关注的是什么？')
  await page.getByRole('button', { name: 'Run compare' }).click()

  await expect(page.getByRole('heading', { name: 'Compare Results' })).toBeVisible()
  await expect(page.getByText('Recommended result')).toBeVisible()
  await expect(page.getByText('Recommendation source: deterministic')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Local baseline' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'SiliconFlow / Qwen2.5-72B-Instruct' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'OpenRouter / qwen-2.5-72b-instruct' })).toHaveCount(0)
  await expect(page.getByText(/Score:/)).toHaveCount(2)
  await expect(page.getByText(/Band:/)).toHaveCount(2)
  await expect(page.getByText('Judge verdict')).toHaveCount(2)
  await expect(page.getByText(/Judge status:/)).toHaveCount(2)
  await expect(page.getByText(/\[fixture siliconflow\]/)).toBeVisible()
  await expect(page.getByText(/\[fixture openrouter\]/)).toHaveCount(0)
  await expect(page.getByText('Saved Compare Sessions')).toBeVisible()
  await expect(page.getByRole('button', { name: /Memory Workspace Compare · Global · 现在最值得优先关注的是什么？/ })).toBeVisible()

  await electronApp.close()
})
