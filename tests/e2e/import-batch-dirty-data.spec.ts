import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('shows dirty-data preflight and imports only supported files while preserving duplicate detail', async () => {
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
  await page.getByRole('button', { name: 'Choose Files' }).click()
  await expect(page.getByText('3 supported, 1 unsupported')).toBeVisible()
  await expect(page.getByText('Unsupported files: fixture-unsupported.exe')).toBeVisible()

  await page.getByRole('button', { name: 'Import Supported Files' }).click()
  await expect(page.getByText('Imported 3 files')).toBeVisible()
  await expect(page.getByText('Skipped / Unsupported: 1')).toBeVisible()
  await expect(page.getByText('Imported 3 · Parsed 3 · Duplicates 1 · Review 0')).toBeVisible()

  await page.getByRole('button', { name: 'View Batch Detail' }).click()

  await expect(page.getByRole('heading', { name: 'Batch Detail' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'duplicate-chat-a.json' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'duplicate-chat-b.json' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'noisy-chat.txt' })).toBeVisible()
  await expect(page.getByText('Batch Summary')).toBeVisible()
  await expect(page.getByText('Imported: 3')).toBeVisible()
  await expect(page.getByText('Parsed: 3')).toBeVisible()
  await expect(page.getByText('Duplicates: 1')).toBeVisible()
  await expect(page.getByText('Review Queue: 0')).toBeVisible()
  await expect(page.getByText('Exact duplicates')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'fixture-unsupported.exe' })).toHaveCount(0)

  await electronApp.close()
})
