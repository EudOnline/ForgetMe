import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, _electron as electron } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { createObjectiveModule } from '../../src/main/modules/objective/runtime/createObjectiveModule'
import { createObjectiveRuntimeTelemetryService } from '../../src/main/services/objectiveRuntimeTelemetryService'

async function seedRuntimeAlertObjective(userDataDir: string) {
  const appPaths = ensureAppPaths(userDataDir)
  const objectiveModule = createObjectiveModule(appPaths)

  const started = await objectiveModule.withArchiveObjectiveRuntime(async (runtime) => {
    return runtime.startObjective({
      title: 'Escalate repeated runtime stalls',
      objectiveKind: 'evidence_investigation',
      prompt: 'Surface open alerts, budget pressure, and trend windows for the operator.',
      initiatedBy: 'operator'
    })
  })

  await objectiveModule.withArchiveDatabase(async (db) => {
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    telemetry.recordEvent({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      eventType: 'objective_stalled',
      payload: {
        roundCount: 2
      },
      createdAt: '2026-04-04T03:00:00.000Z'
    })
    telemetry.recordEvent({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      eventType: 'objective_stalled',
      payload: {
        roundCount: 3
      },
      createdAt: '2026-04-04T03:05:00.000Z'
    })
    telemetry.recordEvent({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      eventType: 'subagent_budget_exhausted',
      payload: {
        specialization: 'compare-analyst'
      },
      createdAt: '2026-04-04T03:06:00.000Z'
    })
    telemetry.recordEvent({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      eventType: 'recovery_attempted',
      payload: {
        proposalId: 'proposal-recovery-1',
        decision: 'cooldown_then_retry',
        reason: 'transient_tool_timeout',
        attemptNumber: 1
      },
      createdAt: '2026-04-04T03:07:00.000Z'
    })
    telemetry.recordEvent({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      eventType: 'objective_recovered',
      payload: {
        proposalId: 'proposal-recovery-1',
        recoveredFrom: 'tool_timeout'
      },
      createdAt: '2026-04-04T03:08:00.000Z'
    })
  })
}

async function launchApp(userDataDir: string) {
  return electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      FORGETME_E2E_USER_DATA_DIR: userDataDir
    }
  })
}

test('objective workbench shows open alerts, budget pressure, and trend windows', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-runtime-alerts-e2e-'))
  await seedRuntimeAlertObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  try {
    await page.getByRole('button', { name: 'Objective Workbench' }).click()
    await expect(page.getByRole('heading', { name: 'Objective Workbench' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Open alerts' })).toBeVisible()
    await expect(page.getByText('Repeated stalled objective')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Budget pressure' })).toBeVisible()
    await expect(page.getByText('Exhausted budgets')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Trend window' })).toBeVisible()
    await expect(page.getByText('Backlog delta (24h)')).toBeVisible()
    await expect(page.getByText('recovery_attempted')).toBeVisible()
    await page.getByRole('button', { name: /recovery_attempted/i }).click()
    await expect(page.getByText('decision: cooldown_then_retry')).toBeVisible()
    await expect(page.getByText('attemptNumber: 1')).toBeVisible()
    await page.getByRole('button', { name: 'Acknowledge alert' }).first().click()
    await page.getByRole('button', { name: 'Refresh objectives' }).click()
    await expect(page.getByText('warning · acknowledged')).toBeVisible()
  } finally {
    await electronApp.close()
  }
})
