import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

async function importFixtureAndOpenAliceWorkspace(page: Awaited<ReturnType<typeof electron.launch>>['firstWindow'] extends () => Promise<infer T> ? T : never, fixtureFileName: string) {
  await page.getByText('Choose Files').click()
  await expect(page.getByRole('button', { name: fixtureFileName })).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Alice Chen$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()
}

async function approveDraftAndOpenHandoff(page: Awaited<ReturnType<typeof electron.launch>>['firstWindow'] extends () => Promise<infer T> ? T : never) {
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
  await draftReviewNotes.fill('Approved for provider send.')
  await sandboxTurn.getByRole('button', { name: 'Save draft edits' }).click()

  await sandboxTurn.getByRole('button', { name: 'Mark in review' }).click()
  await expect(sandboxTurn.getByText('Status: in review')).toBeVisible()

  await sandboxTurn.getByRole('button', { name: 'Approve draft' }).click()
  await expect(sandboxTurn.getByText('Status: approved')).toBeVisible()
  await expect(sandboxTurn.getByRole('heading', { name: 'Approved Draft Handoff' })).toBeVisible()

  return sandboxTurn
}

test('memory workspace approved draft handoff recovers from one failed provider send with manual retry', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10f-provider-send-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10f-provider-send-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase10f-provider-send.json')

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
      FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE: '1',
      FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FAIL_ONCE: '1'
    }
  })

  const page = await electronApp.firstWindow()
  await importFixtureAndOpenAliceWorkspace(page, 'chat-phase10f-provider-send.json')
  const sandboxTurn = await approveDraftAndOpenHandoff(page)
  await expect(sandboxTurn.getByText('Provider Boundary Send')).toBeVisible()
  await expect(sandboxTurn.getByText('No provider sends yet.')).toBeVisible()
  const destinationSelect = sandboxTurn.getByLabel('Destination')
  await expect(destinationSelect).toBeVisible()
  await expect(destinationSelect).toHaveValue('memory-dialogue-default')
  await expect(destinationSelect).toContainText('Memory Dialogue Default')
  await expect(destinationSelect).toContainText('OpenRouter / qwen-2.5-72b-instruct')

  await destinationSelect.selectOption('openrouter-qwen25-72b')

  await sandboxTurn.getByRole('button', { name: 'Send approved draft' }).click()

  await expect(sandboxTurn.getByText('error recorded')).toBeVisible()
  await expect(sandboxTurn.getByText('Attempt: initial send')).toBeVisible()
  await expect(sandboxTurn.getByText('Error: provider fixture offline')).toBeVisible()
  await expect(sandboxTurn.getByRole('button', { name: 'Retry failed send now' })).toBeVisible()

  await sandboxTurn.getByRole('button', { name: 'Retry failed send now' }).click()

  await expect(sandboxTurn.getByText('response recorded')).toBeVisible()
  await expect(sandboxTurn.getByText('Attempt: manual retry')).toBeVisible()
  await expect(sandboxTurn.getByText('Destination: OpenRouter / qwen-2.5-72b-instruct')).toBeVisible()
  await expect(sandboxTurn.getByText('openrouter · qwen/qwen-2.5-72b-instruct')).toBeVisible()
  await expect(sandboxTurn.locator('p', { hasText: 'persona_draft.remote_send_approved' })).toBeVisible()
  await expect(sandboxTurn.getByText('Latest send audit')).toBeVisible()
  const requestAudit = sandboxTurn.locator('summary').filter({ hasText: /^request · / })
  const responseAudit = sandboxTurn.locator('summary').filter({ hasText: /^response · / })
  await expect(requestAudit).toBeVisible()
  await expect(responseAudit).toBeVisible()

  await requestAudit.click()
  await expect(sandboxTurn.locator('pre').filter({ hasText: 'approved_persona_draft_handoff_artifact' })).toBeVisible()

  await responseAudit.click()
  await expect(sandboxTurn.locator('pre').filter({ hasText: 'acknowledgement' })).toBeVisible()

  await electronApp.close()
})

test('memory workspace approved draft handoff auto-retries a failed provider send in the background', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10j-auto-retry-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10j-auto-retry-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase10j-auto-retry.json')

  fs.writeFileSync(chatFixture, JSON.stringify({
    messages: [
      { sender: 'Alice Chen', text: '先把关键记录整理进归档，后面追溯时会更清楚。' },
      { sender: 'Alice Chen', text: '如果一时发不出去，也要保留恢复的机会。' }
    ]
  }))

  const electronApp = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: chatFixture,
      FORGETME_E2E_USER_DATA_DIR: userDataDir,
      FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE: '1',
      FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FAIL_ONCE: '1',
      FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_DELAY_MS: '200',
      FORGETME_APPROVED_DRAFT_SEND_RETRY_RUNNER_INTERVAL_MS: '50',
      FORGETME_APPROVED_DRAFT_SEND_POLL_INTERVAL_MS: '50'
    }
  })

  const page = await electronApp.firstWindow()
  await importFixtureAndOpenAliceWorkspace(page, 'chat-phase10j-auto-retry.json')
  const sandboxTurn = await approveDraftAndOpenHandoff(page)
  const destinationSelect = sandboxTurn.getByLabel('Destination')

  await destinationSelect.selectOption('openrouter-qwen25-72b')
  await sandboxTurn.getByRole('button', { name: 'Send approved draft' }).click()

  await expect(sandboxTurn.getByText('error recorded')).toBeVisible()
  await expect(sandboxTurn.getByText('Auto retry: queued · attempt 1 of 3')).toBeVisible()
  await expect(sandboxTurn.getByText(/^Next retry: /)).toBeVisible()

  await expect(sandboxTurn.getByText('response recorded')).toBeVisible({ timeout: 10_000 })
  await expect(sandboxTurn.getByText('Attempt: automatic retry')).toBeVisible()
  await expect(sandboxTurn.getByText('Destination: OpenRouter / qwen-2.5-72b-instruct')).toBeVisible()

  await electronApp.close()
})

test('memory workspace approved draft handoff resumes queued auto-retry after app relaunch', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10j-launch-recovery-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10j-launch-recovery-fixtures-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase10j-launch-recovery.json')

  fs.writeFileSync(chatFixture, JSON.stringify({
    messages: [
      { sender: 'Alice Chen', text: '先保留失败记录，再让系统自己恢复。' },
      { sender: 'Alice Chen', text: '重启以后也不该丢掉之前排队的补发。' }
    ]
  }))

  const firstLaunch = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: chatFixture,
      FORGETME_E2E_USER_DATA_DIR: userDataDir,
      FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE: '1',
      FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FAIL_ONCE: '1',
      FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_DELAY_MS: '1500',
      FORGETME_APPROVED_DRAFT_SEND_RETRY_RUNNER_INTERVAL_MS: '50',
      FORGETME_APPROVED_DRAFT_SEND_POLL_INTERVAL_MS: '50'
    }
  })

  const firstPage = await firstLaunch.firstWindow()
  await importFixtureAndOpenAliceWorkspace(firstPage, 'chat-phase10j-launch-recovery.json')
  const firstSandboxTurn = await approveDraftAndOpenHandoff(firstPage)
  await firstSandboxTurn.getByLabel('Destination').selectOption('openrouter-qwen25-72b')
  await firstSandboxTurn.getByRole('button', { name: 'Send approved draft' }).click()

  await expect(firstSandboxTurn.getByText('error recorded')).toBeVisible()
  await expect(firstSandboxTurn.getByText('Auto retry: queued · attempt 1 of 3')).toBeVisible()

  await firstLaunch.close()

  const secondLaunch = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: chatFixture,
      FORGETME_E2E_USER_DATA_DIR: userDataDir,
      FORGETME_E2E_APPROVED_DRAFT_PROVIDER_SEND_FIXTURE: '1',
      FORGETME_APPROVED_DRAFT_SEND_RETRY_RUNNER_INTERVAL_MS: '50',
      FORGETME_APPROVED_DRAFT_SEND_POLL_INTERVAL_MS: '50'
    }
  })

  const secondPage = await secondLaunch.firstWindow()
  await secondPage.getByRole('button', { name: 'People' }).click()
  await expect(secondPage.getByRole('button', { name: /^Alice Chen$/ })).toBeVisible({ timeout: 15_000 })
  await secondPage.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(secondPage.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await secondPage.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(secondPage.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()

  const resumedSandboxTurn = secondPage.locator('section').filter({
    has: secondPage.getByRole('heading', { name: 'Approved Draft Handoff' })
  }).first()

  await expect(resumedSandboxTurn.getByText('response recorded')).toBeVisible({ timeout: 15_000 })
  await expect(resumedSandboxTurn.getByText('Attempt: automatic retry')).toBeVisible()
  await expect(resumedSandboxTurn.getByText('Destination: OpenRouter / qwen-2.5-72b-instruct')).toBeVisible()

  await secondLaunch.close()
})
