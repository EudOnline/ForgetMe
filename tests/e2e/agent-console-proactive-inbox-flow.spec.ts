import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { createAgentRun, upsertAgentSuggestion } from '../../src/main/services/agentPersistenceService'
import { openDatabase, runMigrations } from '../../src/main/services/db'

function seedAgentProactiveInbox(userDataDir: string) {
  const appPaths = ensureAppPaths(userDataDir)
  const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
  runMigrations(db)

  createAgentRun(db, {
    runId: 'run-failed-1',
    role: 'governance',
    taskKind: 'governance.summarize_failures',
    prompt: 'Summarize recent runtime failures.',
    status: 'failed',
    errorMessage: 'runtime failure',
    createdAt: '2026-03-30T00:10:00.000Z',
    updatedAt: '2026-03-30T00:10:00.000Z'
  })

  upsertAgentSuggestion(db, {
    suggestionId: 'suggestion-dismiss',
    triggerKind: 'ingestion.failed_enrichment_job',
    role: 'ingestion',
    taskKind: 'ingestion.rerun_enrichment',
    taskInput: {
      role: 'ingestion',
      taskKind: 'ingestion.rerun_enrichment',
      prompt: 'Rerun failed enrichment job job-1 for file source.pdf.'
    },
    dedupeKey: 'ingestion.failed-enrichment::job-1',
    sourceRunId: null,
    observedAt: '2026-03-30T00:11:00.000Z'
  })

  db.close()
}

test('agent console proactive inbox refreshes, runs, and dismisses suggestions', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-console-proactive-e2e-'))
  seedAgentProactiveInbox(userDataDir)

  const electronApp = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })

  const page = await electronApp.firstWindow()

  await page.getByRole('button', { name: 'Agent Console' }).click()
  await expect(page.getByRole('heading', { name: 'Agent Console' })).toBeVisible()
  await expect(page.getByText('Proactive inbox')).toBeVisible()
  await expect(page.getByText('Rerun failed enrichment job job-1 for file source.pdf.')).toBeVisible()

  await page.getByRole('button', { name: 'Refresh suggestions' }).click()
  await expect(page.getByText('Summarize failed agent runs from the proactive monitor.')).toBeVisible()

  await page.getByRole('button', { name: 'Run suggestion' }).first().click()
  await expect(page.getByText('1 failed runs need review.').first()).toBeVisible()
  await expect(
    page
      .getByLabel('Proactive inbox')
      .getByText('Propose policy update: Review repeated runtime failures and tighten policy safeguards.')
  ).toBeVisible()

  await page.getByRole('button', { name: 'Dismiss suggestion' }).first().click()
  await expect(page.getByRole('button', { name: 'Dismiss suggestion' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Dismiss suggestion' }).click()
  await expect(page.getByText('No proactive suggestions right now.')).toBeVisible()

  await electronApp.close()
})
