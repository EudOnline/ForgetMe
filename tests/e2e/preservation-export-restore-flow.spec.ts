import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { importFixturesThroughPreflight } from './helpers/importFlow'

test('exports an encrypted archive package, restores it, and runs a repeatable recovery drill', async () => {
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
  await importFixturesThroughPreflight(page, 'sample-chat.txt')

  await page.getByRole('button', { name: 'Preservation' }).click()
  await page.getByLabel('Export password').fill('secret-preservation')
  await page.getByLabel('Restore password').fill('secret-preservation')
  await page.getByRole('button', { name: 'Export Archive' }).click()
  await expect(page.getByText('Export completed')).toBeVisible()

  const exportRoots = fs.readdirSync(exportDir)
  expect(exportRoots.length).toBeGreaterThan(0)
  const exportRoot = path.join(exportDir, exportRoots[0]!)
  expect(fs.existsSync(path.join(exportRoot, 'manifest.json'))).toBe(true)
  expect(fs.existsSync(path.join(exportRoot, 'package', 'archive.enc'))).toBe(true)
  expect(fs.existsSync(path.join(exportRoot, 'database', 'archive.sqlite'))).toBe(false)

  await page.getByRole('button', { name: 'Restore Archive' }).click()
  await expect(page.getByText('Restore checks passed')).toBeVisible()
  await page.getByRole('button', { name: 'Run Recovery Drill' }).click()
  await expect(page.getByText('Recovery drill passed')).toBeVisible()
  await page.getByRole('button', { name: 'Run Recovery Drill' }).click()
  await expect(page.getByText('Recovery drill passed')).toBeVisible()

  await electronApp.close()
})
