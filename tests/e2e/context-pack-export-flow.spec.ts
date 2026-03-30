import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { importFixturesThroughPreflight } from './helpers/importFlow'

test('exports person and group context packs as local json artifacts', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase8c-e2e-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase8c-fixtures-'))
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase8c-export-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase8c.json')

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
      FORGETME_E2E_USER_DATA_DIR: userDataDir,
      FORGETME_E2E_CONTEXT_PACK_DESTINATION_DIR: exportDir
    }
  })

  const page = await electronApp.firstWindow()
  await importFixturesThroughPreflight(page, 'chat-phase8c.json')

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Alice Chen$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByLabel('Context pack mode').selectOption('approved_only')
  await page.getByRole('button', { name: 'Choose context pack destination' }).click()
  await page.getByRole('button', { name: 'Export context pack' }).click()
  await expect(page.getByText(/^Exported person-.*-context-pack\.json$/)).toBeVisible()

  await expect.poll(() => fs.readdirSync(exportDir).find((fileName) => fileName.startsWith('person-') && fileName.endsWith('-context-pack.json')) ?? null).not.toBeNull()
  const personFileName = fs.readdirSync(exportDir).find((fileName) => fileName.startsWith('person-') && fileName.endsWith('-context-pack.json'))
  expect(personFileName).toBeTruthy()
  const personPackPath = path.join(exportDir, personFileName!)
  const personPack = JSON.parse(fs.readFileSync(personPackPath, 'utf8'))
  expect(personPack.formatVersion).toBe('phase8c1')
  expect(personPack.scope.kind).toBe('person')
  expect(typeof personPack.scope.canonicalPersonId).toBe('string')
  expect(personPack.scope.canonicalPersonId.length).toBeGreaterThan(0)
  expect(personPack.mode).toBe('approved_only')
  expect(personPack.shareEnvelope).toEqual({
    requestShape: 'local_json_context_pack',
    policyKey: 'context_pack.local_export_baseline'
  })

  await page.getByRole('button', { name: 'Group Portrait', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Group Portraits' })).toBeVisible()
  await page.getByRole('button', { name: 'Open Alice Chen Group Portrait' }).click()
  await expect(page.getByRole('heading', { name: 'Group Portrait' })).toBeVisible()
  await page.getByRole('button', { name: 'Choose context pack destination' }).click()
  await page.getByRole('button', { name: 'Export context pack' }).click()
  await expect(page.getByText(/^Exported group-.*-context-pack\.json$/)).toBeVisible()

  await expect.poll(() => fs.readdirSync(exportDir).find((fileName) => fileName.startsWith('group-') && fileName.endsWith('-context-pack.json')) ?? null).not.toBeNull()
  const groupFileName = fs.readdirSync(exportDir).find((fileName) => fileName.startsWith('group-') && fileName.endsWith('-context-pack.json'))
  expect(groupFileName).toBeTruthy()
  const groupPackPath = path.join(exportDir, groupFileName!)
  const groupPack = JSON.parse(fs.readFileSync(groupPackPath, 'utf8'))
  expect(groupPack.formatVersion).toBe('phase8c1')
  expect(groupPack.scope.kind).toBe('group')
  expect(typeof groupPack.scope.anchorPersonId).toBe('string')
  expect(groupPack.scope.anchorPersonId.length).toBeGreaterThan(0)
  expect(groupPack.mode).toBe('approved_plus_derived')
  expect(groupPack.shareEnvelope).toEqual({
    requestShape: 'local_json_context_pack',
    policyKey: 'context_pack.local_export_baseline'
  })

  await electronApp.close()
})
