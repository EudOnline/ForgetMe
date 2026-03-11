import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

test('exports and restores a local archive package from the Preservation page', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-e2e-user-'))
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-e2e-export-'))
  const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase6-e2e-restore-'))

  const electronApp = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: path.resolve('tests/fixtures/imports/sample-chat.txt'),
      FORGETME_E2E_USER_DATA_DIR: userDataDir,
      FORGETME_E2E_BACKUP_DESTINATION_DIR: exportDir,
      FORGETME_E2E_RESTORE_TARGET_DIR: restoreDir
    }
  })

  const page = await electronApp.firstWindow()
  await page.getByText('Choose Files').click()
  await expect(page.getByRole('button', { name: 'sample-chat.txt' })).toBeVisible()

  await page.getByRole('button', { name: 'Preservation' }).click()
  await page.getByRole('button', { name: 'Export Archive' }).click()
  await expect(page.getByText('Export completed')).toBeVisible()
  await page.getByRole('button', { name: 'Restore Archive' }).click()
  await expect(page.getByText('Restore checks passed')).toBeVisible()

  await electronApp.close()
})
