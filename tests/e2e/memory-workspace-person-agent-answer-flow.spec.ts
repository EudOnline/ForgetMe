import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { importFixturesThroughPreflight } from './helpers/importFlow'

test('memory workspace routes factual person asks through the promoted backstage person agent', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10d-person-agent-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10d-person-agent-fixtures-'))
  const chatFixtureOne = path.join(fixtureDir, 'chat-phase10d-person-agent-1.json')
  const chatFixtureTwo = path.join(fixtureDir, 'chat-phase10d-person-agent-2.json')

  fs.writeFileSync(chatFixtureOne, JSON.stringify({
    messages: [
      { sender: 'Alice Chen', text: '我们还是把这些记录留在归档里，后面查起来更稳妥。' },
      { sender: 'Bob Li', text: '这样后面一起回看会更清楚。' }
    ]
  }))
  fs.writeFileSync(chatFixtureTwo, JSON.stringify({
    messages: [
      { sender: 'Alice Chen', text: '我会继续记下关键细节，归档后就不会丢。' },
      { sender: 'Bob Li', text: '重要的信息还是一起整理一下。' }
    ]
  }))

  const electronApp = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_FIXTURE: `${chatFixtureOne}${path.delimiter}${chatFixtureTwo}`,
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()
  await importFixturesThroughPreflight(page, [
    'chat-phase10d-person-agent-1.json',
    'chat-phase10d-person-agent-2.json'
  ])

  await page.waitForFunction(() => {
    return Boolean((window as typeof window & { archiveApi?: unknown }).archiveApi)
  })

  const personAgentState = await page.evaluate(async () => {
    const archiveApi = (window as typeof window & {
      archiveApi?: {
        listCanonicalPeople: () => Promise<Array<{ id: string; primaryDisplayName: string }>>
        getPersonAgentState: (input: { canonicalPersonId: string }) => Promise<{
          status: string
          promotionTier: string
        } | null>
      }
    }).archiveApi

    if (!archiveApi) {
      return null
    }

    const people = await archiveApi.listCanonicalPeople()
    const alice = people.find((person) => person.primaryDisplayName === 'Alice Chen')
    if (!alice) {
      return null
    }

    return archiveApi.getPersonAgentState({ canonicalPersonId: alice.id })
  })

  expect(personAgentState).toMatchObject({
    status: 'active'
  })

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Alice Chen$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()

  await page.getByLabel('Ask memory workspace').fill('她和 Bob Li 是什么关系？')
  await page.getByRole('button', { name: 'Ask' }).click()

  const firstTurn = page.locator('section[aria-label="Turn 1"]')
  await expect(firstTurn).toBeVisible()
  const answerRegion = firstTurn.getByLabel('Answer')
  await expect(answerRegion.getByText('shared evidence files: 2')).toBeVisible()
  await expect(answerRegion.getByRole('button', { name: 'chat-phase10d-person-agent-1.json' })).toBeVisible()

  await electronApp.close()
})
