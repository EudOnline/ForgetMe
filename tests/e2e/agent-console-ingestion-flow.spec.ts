import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('agent console runs a real ingestion import after file picking and preflight', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-console-ingestion-e2e-'))
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
  await page.getByRole('button', { name: 'Agent Console' }).click()
  await expect(page.getByRole('heading', { name: 'Agent Console' })).toBeVisible()

  await page.getByLabel('Role override').selectOption('ingestion')
  await page.getByLabel('Agent prompt').fill('Import these files into the archive')
  await page.getByRole('button', { name: 'Run agent task' }).click()

  await expect(page.getByText('1 supported, 1 unsupported')).toBeVisible()
  await expect(page.getByText(/Import batch .* created/i).first()).toBeVisible()

  await electronApp.close()
})
