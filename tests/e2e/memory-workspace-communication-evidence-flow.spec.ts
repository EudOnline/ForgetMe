import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('memory workspace shows communication evidence and supports quote-backed redirect follow-ups', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10b-e2e-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10b-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase10b-communication.json')

  fs.writeFileSync(chatFixture, JSON.stringify({
    messages: [
      { sender: 'Alice Chen', text: '我们还是把这些记录留在归档里，后面查起来更稳妥。' },
      { sender: 'Bob Li', text: '先把聊天整理成归档笔记，这样以后能找到。' },
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
  await page.getByText('Choose Files').click()
  await expect(page.getByRole('button', { name: 'chat-phase10b-communication.json' })).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Alice Chen$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()

  await page.getByLabel('Ask memory workspace').fill('她过去是怎么表达记录和归档这类事的？给我看原话。')
  await page.getByRole('button', { name: 'Ask' }).click()

  await expect(page.getByRole('heading', { name: 'Memory Workspace · Alice Chen' })).toBeVisible()
  const communicationEvidenceSection = page.getByLabel('Communication Evidence')
  await expect(communicationEvidenceSection).toBeVisible()
  await expect(communicationEvidenceSection.getByText('我们还是把这些记录留在归档里，后面查起来更稳妥。')).toBeVisible()
  await expect(communicationEvidenceSection.getByRole('button', { name: 'chat-phase10b-communication.json' }).first()).toBeVisible()

  await page.getByLabel('Ask memory workspace').fill('如果她本人会怎么建议我？请模仿她的口吻回答。')
  await page.getByRole('button', { name: 'Ask' }).click()

  await expect(page.getByText('Persona request blocked')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Past expressions' })).toBeVisible()
  await page.getByRole('button', { name: 'Past expressions' }).click()

  await expect(page.locator('section[aria-label="Turn 3"]')).toBeVisible()
  await expect(page.locator('section[aria-label="Turn 3"]').getByText('Communication Evidence')).toBeVisible()
  await expect(page.locator('section[aria-label="Turn 3"]').getByText('我会继续记下关键细节，归档后就不会丢。')).toBeVisible()

  await electronApp.close()
})
