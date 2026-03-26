import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('imports mixed dirty data without aborting and shows duplicate plus skipped status in batch detail', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-e2e-dirty-data-'))
  const unsupportedFile = path.join(userDataDir, 'fixture-unsupported.exe')
  fs.writeFileSync(unsupportedFile, 'binary-ish fixture')

  const electronApp = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: [
        path.resolve('tests/fixtures/imports/duplicate-chat-a.json'),
        path.resolve('tests/fixtures/imports/duplicate-chat-b.json'),
        path.resolve('tests/fixtures/imports/noisy-chat.txt'),
        unsupportedFile
      ].join(path.delimiter),
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()
  await page.getByText('Choose Files').click()
  await expect(page.getByRole('alert')).toContainText('fixture-unsupported.exe')
  await page.getByRole('button', { name: 'duplicate-chat-a.json' }).click()

  await expect(page.getByRole('heading', { name: 'Batch Detail' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'duplicate-chat-a.json' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'duplicate-chat-b.json' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'noisy-chat.txt' })).toBeVisible()
  await expect(page.getByText('Exact duplicates')).toBeVisible()
  await expect(page.getByText('Skipped imports')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'fixture-unsupported.exe' })).toBeVisible()

  await electronApp.close()
})
