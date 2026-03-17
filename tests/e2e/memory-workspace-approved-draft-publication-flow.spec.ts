import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('memory workspace approved draft publication writes a share package and shows publication history', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10k-publication-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10k-publication-fixtures-'))
  const publicationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10k-publication-output-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase10k-publication.json')

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
      FORGETME_E2E_USER_DATA_DIR: userDataDir,
      FORGETME_E2E_APPROVED_DRAFT_PUBLICATION_DESTINATION_DIR: publicationDir
    }
  })

  const page = await electronApp.firstWindow()
  await page.getByText('Choose Files').click()
  await expect(page.getByRole('button', { name: 'chat-phase10k-publication.json' })).toBeVisible()

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
  await expect(sandboxTurn.getByRole('button', { name: 'Start draft review' })).toBeVisible()
  await sandboxTurn.getByRole('button', { name: 'Start draft review' }).click()

  const draftReviewBody = sandboxTurn.getByLabel('Draft review body')
  const draftReviewNotes = sandboxTurn.getByLabel('Draft review notes')

  await draftReviewBody.fill('可审阅草稿：先把关键记录整理进归档，再补齐细节。')
  await draftReviewNotes.fill('Approved for publication share package.')
  await sandboxTurn.getByRole('button', { name: 'Save draft edits' }).click()

  await sandboxTurn.getByRole('button', { name: 'Mark in review' }).click()
  await expect(sandboxTurn.getByText('Status: in review')).toBeVisible()

  await sandboxTurn.getByRole('button', { name: 'Approve draft' }).click()
  await expect(sandboxTurn.getByText('Status: approved')).toBeVisible()
  await expect(sandboxTurn.getByRole('heading', { name: 'Approved Draft Handoff' })).toBeVisible()
  await expect(sandboxTurn.getByText('Publish / Share')).toBeVisible()

  await sandboxTurn.getByRole('button', { name: 'Choose publish destination' }).click()
  await expect(sandboxTurn.getByText(publicationDir)).toBeVisible()
  await sandboxTurn.getByRole('button', { name: 'Publish approved draft' }).click()

  await expect(sandboxTurn.getByText('Published publication.json')).toBeVisible()
  await expect(sandboxTurn.getByText('Publication history')).toBeVisible()

  await expect.poll(() => fs.readdirSync(publicationDir).find((entry) => entry.startsWith('approved-draft-publication-')) ?? null).not.toBeNull()
  const packageDirName = fs.readdirSync(publicationDir).find((entry) => entry.startsWith('approved-draft-publication-'))
  expect(packageDirName).toBeTruthy()

  const packageRoot = path.join(publicationDir, packageDirName!)
  const publicationPath = path.join(packageRoot, 'publication.json')
  const manifestPath = path.join(packageRoot, 'manifest.json')

  expect(fs.existsSync(publicationPath)).toBe(true)
  expect(fs.existsSync(manifestPath)).toBe(true)

  const publicationPayload = JSON.parse(fs.readFileSync(publicationPath, 'utf8'))
  expect(publicationPayload.formatVersion).toBe('phase10k1')
  expect(publicationPayload.publicationKind).toBe('local_share_package')
  expect(publicationPayload.approvedDraft).toContain('归档')
  expect(publicationPayload).not.toHaveProperty('reviewNotes')

  const manifestPayload = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  expect(manifestPayload.sourceArtifact).toBe('approved_persona_draft_handoff')
  expect(manifestPayload.publicArtifactFileName).toBe('publication.json')

  await electronApp.close()
})
