import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright'

function isoDate() {
  return new Date().toISOString().slice(0, 10)
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
  return dirPath
}

async function safeWait(locator, timeoutMs = 15_000) {
  await locator.waitFor({ timeout: timeoutMs })
}

async function screenshot(page, outDir, filename) {
  const outPath = path.join(outDir, filename)
  await page.waitForTimeout(250)
  await page.screenshot({ path: outPath })
  return outPath
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
  return filePath
}

async function main() {
  const desktopDir = process.env.HOME ? path.join(process.env.HOME, 'Desktop') : '/Users/lvxiaoer/Desktop'
  const outDir = ensureDir(path.join(desktopDir, `ForgetMe-UI-Review-${isoDate()}`))

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-ui-review-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-ui-review-fixture-'))
  const chatA = writeJson(path.join(fixtureDir, 'chat-a.json'), {
    messages: [
      { sender: 'Alice Chen', text: 'hello' },
      { sender: 'Bob', text: 'hi' }
    ]
  })
  const chatB = writeJson(path.join(fixtureDir, 'chat-b.json'), {
    messages: [
      { sender: 'alice chen', text: 'hey' },
      { sender: 'Carol', text: 'yo' }
    ]
  })

  const electronApp = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: [chatA, chatB].join(path.delimiter),
      FORGETME_E2E_USER_DATA_DIR: userDataDir,
      FORGETME_E2E_GROUP_PORTRAIT_FIXTURE: '1',
      FORGETME_E2E_RUNNER_PROFILE_FIXTURE: '1',
      FORGETME_ENRICHMENT_RUNNER_INTERVAL_MS: '100'
    }
  })

  const page = await electronApp.firstWindow()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const nav = page.locator('.fmNav')

  const shots = []

  await safeWait(page.getByRole('heading', { name: 'Import Batch' }))
  shots.push(await screenshot(page, outDir, '01-import-empty.png'))

  await page.getByRole('button', { name: 'Choose Files' }).click()
  await safeWait(page.getByRole('heading', { name: 'Recent Batches' }))
  await safeWait(page.getByRole('button', { name: 'chat-a.json' }))
  shots.push(await screenshot(page, outDir, '02-import-after-import.png'))

  await nav.getByRole('button', { name: 'Batches', exact: true }).click()
  await safeWait(page.getByRole('heading', { name: 'Recent Batches' }))
  shots.push(await screenshot(page, outDir, '03-batches.png'))

  await page.getByRole('button', { name: 'chat-a.json' }).click()
  await safeWait(page.getByRole('heading', { name: 'Batch Detail' }))
  shots.push(await screenshot(page, outDir, '04-batch-detail.png'))

  await nav.getByRole('button', { name: 'People', exact: true }).click()
  await safeWait(page.getByRole('heading', { name: 'People' }))
  shots.push(await screenshot(page, outDir, '05-people.png'))

  const bobButton = page.getByRole('button', { name: /^Bob Li$/ })
  if (await bobButton.count()) {
    await bobButton.first().click()
    await safeWait(page.getByRole('heading', { name: 'Person Dossier' }))
    shots.push(await screenshot(page, outDir, '06-person-dossier.png'))
  }

  await nav.getByRole('button', { name: 'Group Portrait', exact: true }).click()
  await safeWait(page.getByRole('heading', { name: 'Group Portraits' }))
  shots.push(await screenshot(page, outDir, '07-group-portraits.png'))

  const openGroupPortrait = page.locator('.fmContentInner').getByRole('button', { name: /^Open / }).first()
  if (await openGroupPortrait.count()) {
    await openGroupPortrait.click()
    await safeWait(page.getByRole('heading', { name: 'Group Portrait' }))
    shots.push(await screenshot(page, outDir, '08-group-portrait-detail.png'))
  }

  await nav.getByRole('button', { name: 'Review Queue', exact: true }).click()
  await safeWait(page.getByRole('heading', { name: 'Review Queue' }))
  shots.push(await screenshot(page, outDir, '09-review-queue.png'))

  await nav.getByRole('button', { name: 'Review Workbench', exact: true }).click()
  await safeWait(page.getByRole('heading', { name: 'Review Workbench' }), 20_000)
  await page.waitForTimeout(400)
  shots.push(await screenshot(page, outDir, '10-review-workbench.png'))

  await nav.getByRole('button', { name: 'Enrichment Jobs', exact: true }).click()
  await safeWait(page.getByRole('heading', { name: 'Enrichment Jobs' }))
  shots.push(await screenshot(page, outDir, '11-enrichment-jobs.png'))

  await nav.getByRole('button', { name: 'Search', exact: true }).click()
  await safeWait(page.getByRole('heading', { name: 'Search' }))
  shots.push(await screenshot(page, outDir, '12-search.png'))

  await nav.getByRole('button', { name: 'Memory Workspace', exact: true }).click()
  await safeWait(page.getByRole('heading', { name: 'Memory Workspace', exact: true }), 20_000)
  shots.push(await screenshot(page, outDir, '13-memory-workspace-empty.png'))

  await page.getByLabel('Ask memory workspace').fill('现在最值得优先关注的是什么？')
  await page.getByRole('button', { name: 'Ask' }).click()
  await safeWait(page.getByRole('heading', { name: /Memory Workspace · / }), 20_000)
  shots.push(await screenshot(page, outDir, '14-memory-workspace-after-ask.png'))

  // Verify language switching without affecting earlier English-label selectors.
  await page.locator('.fmLang select').selectOption('zh-CN')
  await safeWait(page.getByText('语言'))
  shots.push(await screenshot(page, outDir, '15-memory-workspace-zh.png'))

  await electronApp.close()

  for (const filePath of shots) {
    console.log(filePath)
  }
}

await main()
