import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('shows preflight before import and only imports supported files into the batch', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-e2e-'))
  const unsupportedFile = path.join(userDataDir, 'fixture-unsupported.exe')
  fs.writeFileSync(unsupportedFile, 'binary-ish fixture')

  const electronApp = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: [
        path.resolve('tests/fixtures/imports/sample-chat.txt'),
        unsupportedFile
      ].join(path.delimiter),
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()
  await page.getByRole('button', { name: 'Choose Files' }).click()
  await expect(page.getByText('1 supported, 1 unsupported')).toBeVisible()
  await expect(page.getByText('Unsupported files: fixture-unsupported.exe')).toBeVisible()

  await page.getByRole('button', { name: 'Import Supported Files' }).click()
  await expect(page.getByText('Imported 1 file')).toBeVisible()
  await expect(page.getByText('Skipped / Unsupported: 1')).toBeVisible()
  await expect(page.getByText('Imported 1 · Parsed 1 · Duplicates 0 · Review 0')).toBeVisible()

  await page.getByRole('button', { name: 'View Batch Detail' }).click()
  await expect(page.getByRole('heading', { name: 'Batch Detail' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'sample-chat.txt' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'fixture-unsupported.exe' })).toHaveCount(0)

  await electronApp.close()
})
