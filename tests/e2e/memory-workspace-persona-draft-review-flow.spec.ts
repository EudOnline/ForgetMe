import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { importFixturesThroughPreflight } from './helpers/importFlow'

test('memory workspace persona draft review flow supports start edit review and approval', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10d-draft-review-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10d-draft-review-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase10d-draft-review.json')

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
  await importFixturesThroughPreflight(page, 'chat-phase10d-draft-review.json')

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
  await expect(sandboxTurn.getByText('Reviewed draft sandbox')).toBeVisible()
  await expect(sandboxTurn.getByRole('button', { name: 'Start draft review' })).toBeVisible()

  await sandboxTurn.getByRole('button', { name: 'Start draft review' }).click()

  const draftReviewBody = sandboxTurn.getByLabel('Draft review body')
  const draftReviewNotes = sandboxTurn.getByLabel('Draft review notes')

  await expect(draftReviewBody).toBeVisible()
  await draftReviewBody.fill('可审阅草稿：先把关键记录整理进归档，再补齐细节。')
  await draftReviewNotes.fill('Approved for internal review.')
  await sandboxTurn.getByRole('button', { name: 'Save draft edits' }).click()

  await expect(draftReviewBody).toHaveValue('可审阅草稿：先把关键记录整理进归档，再补齐细节。')
  await expect(draftReviewNotes).toHaveValue('Approved for internal review.')

  await sandboxTurn.getByRole('button', { name: 'Mark in review' }).click()
  await expect(sandboxTurn.getByText('Status: in review')).toBeVisible()

  await sandboxTurn.getByRole('button', { name: 'Approve draft' }).click()
  await expect(sandboxTurn.getByText('Status: approved')).toBeVisible()
  await expect(draftReviewBody).toBeDisabled()
  await expect(draftReviewNotes).toBeDisabled()

  await electronApp.close()
})
