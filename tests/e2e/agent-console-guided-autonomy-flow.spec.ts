import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import {
  createAgentRun,
  upsertAgentRuntimeSettings,
  upsertAgentSuggestion
} from '../../src/main/services/agentPersistenceService'
import { openDatabase, runMigrations } from '../../src/main/services/db'

function seedGuidedAutonomyState(userDataDir: string) {
  const appPaths = ensureAppPaths(userDataDir)
  const db = openDatabase(path.join(appPaths.sqliteDir, 'archive.sqlite'))
  runMigrations(db)

  upsertAgentRuntimeSettings(db, {
    autonomyMode: 'manual_only',
    updatedAt: '2026-03-30T00:00:00.000Z'
  })

  createAgentRun(db, {
    runId: 'run-auto-1',
    role: 'governance',
    taskKind: 'governance.summarize_failures',
    prompt: 'Summarize failed agent runs from the proactive monitor.',
    latestAssistantResponse: '0 failed runs need review.',
    status: 'completed',
    executionOrigin: 'auto_runner',
    createdAt: '2026-03-30T00:01:00.000Z',
    updatedAt: '2026-03-30T00:01:00.000Z'
  })

  const parentSuggestion = upsertAgentSuggestion(db, {
    suggestionId: 'suggestion-parent',
    triggerKind: 'governance.failed_runs_detected',
    role: 'governance',
    taskKind: 'governance.summarize_failures',
    taskInput: {
      role: 'governance',
      taskKind: 'governance.summarize_failures',
      prompt: 'Summarize failed agent runs from the proactive monitor.'
    },
    dedupeKey: 'governance.failed-runs::latest',
    sourceRunId: null,
    priority: 'high',
    rationale: 'Repeated enrichment failures are blocking downstream review.',
    autoRunnable: true,
    followUpOfSuggestionId: null,
    observedAt: '2026-03-30T00:02:00.000Z'
  })

  upsertAgentSuggestion(db, {
    suggestionId: 'suggestion-followup',
    triggerKind: 'review.safe_group_available',
    role: 'review',
    taskKind: 'review.apply_safe_group',
    taskInput: {
      role: 'review',
      taskKind: 'review.apply_safe_group',
      prompt: 'Apply safe group group-safe-42.'
    },
    dedupeKey: 'review.safe-group::group-safe-42::follow-up',
    sourceRunId: null,
    priority: 'high',
    rationale: 'The safe group recommendation is ready to apply manually.',
    autoRunnable: false,
    followUpOfSuggestionId: parentSuggestion.suggestionId,
    observedAt: '2026-03-30T00:03:00.000Z'
  })

  db.close()
}

test('agent console shows guided autonomy controls and audit metadata', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-agent-console-guided-autonomy-e2e-'))
  seedGuidedAutonomyState(userDataDir)

  const electronApp = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_USER_DATA_DIR: userDataDir,
      FORGETME_AGENT_PROACTIVE_RUNNER_INTERVAL_MS: '3600000'
    }
  })

  const page = await electronApp.firstWindow()

  await page.getByRole('button', { name: 'Agent Console' }).click()
  await expect(page.getByRole('heading', { name: 'Agent Console' })).toBeVisible()
  await expect(page.getByText('Autonomy mode')).toBeVisible()
  await expect(page.getByText('Priority: high').first()).toBeVisible()
  await expect(page.getByText('Auto-run eligible: yes')).toBeVisible()
  await expect(page.getByText('Follow-up of suggestion: suggestion-parent')).toBeVisible()
  await expect(page.getByText('Execution origin: auto_runner').first()).toBeVisible()

  await page.getByLabel('Autonomy mode').selectOption('suggest_safe_auto_run')
  await expect(page.getByText('Autonomy mode updated to suggest_safe_auto_run.')).toBeVisible()

  await page.getByRole('button', { name: 'Run suggestion' }).first().click()
  await expect(page.getByText('Confirmation token required before applying this review action.')).toBeVisible()

  await electronApp.close()
})
