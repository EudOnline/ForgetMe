import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { createExternalVerificationBrokerService } from '../../src/main/services/externalVerificationBrokerService'
import { createObjectiveModule } from '../../src/main/modules/objective/runtime/createObjectiveModule'
import { createSubagentRegistryService } from '../../src/main/services/subagentRegistryService'

async function seedBudgetLimitedObjective(userDataDir: string) {
  const appPaths = ensureAppPaths(userDataDir)
  const objectiveModule = createObjectiveModule(appPaths)
  const session = objectiveModule.createRuntimeSession({
    externalVerificationBroker: createExternalVerificationBrokerService({
      searchWeb: async () => [],
      openSourcePage: async ({ url }) => ({
        url,
        title: null,
        publishedAt: null,
        excerpt: ''
      })
    }),
    subagentRegistry: createSubagentRegistryService(),
    roleAgentRegistry: null,
    runMemoryWorkspaceCompare: async () => ({
      compareSessionId: 'compare-session-1',
      scope: { kind: 'global' as const },
      title: 'Memory Workspace Compare',
      question: 'Compare grounded answer candidates for this request.',
      expressionMode: 'grounded' as const,
      workflowKind: 'default' as const,
      runCount: 2,
      metadata: {
        completedRunCount: 2,
        failedRunCount: 0,
        judgeStatus: 'ready' as const
      },
      recommendation: {
        status: 'ready' as const,
        recommendedCompareRunId: 'compare-run-local',
        reason: 'The baseline answer stayed the most grounded.'
      },
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:10.000Z',
      runs: [
        {
          compareRunId: 'compare-run-local',
          compareSessionId: 'compare-session-1',
          ordinal: 1,
          targetId: 'local-baseline',
          targetLabel: 'Local baseline',
          executionMode: 'local_baseline' as const,
          provider: null,
          model: null,
          status: 'completed' as const,
          errorMessage: null,
          response: null,
          evaluation: null,
          judgeVerdict: null,
          promptHash: 'prompt-hash-1',
          contextHash: 'context-hash-1',
          createdAt: '2026-03-30T00:00:00.000Z'
        }
      ]
    })
  } as any)
  const { runtime } = session

  try {
    const started = await runtime.startObjective({
      title: 'Surface bounded compare budget failures',
      objectiveKind: 'user_response',
      prompt: 'Show when a bounded compare analyst runs out of budget.',
      initiatedBy: 'operator'
    })
    const compareSpec = createSubagentRegistryService().buildSpawnSubagentSpec({
      specialization: 'compare-analyst',
      payload: {
        question: 'Compare grounded answer candidates for this request.'
      }
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'spawn_subagent',
      payload: compareSpec.payload,
      ownerRole: 'workspace',
      requiresOperatorConfirmation: false,
      toolPolicyId: compareSpec.toolPolicyId,
      budget: {
        maxRounds: 2,
        maxToolCalls: 1,
        timeoutMs: 30_000
      }
    })

    try {
      await runtime.respondToAgentProposal({
        proposalId: proposal.proposalId,
        responderRole: 'workspace',
        response: 'approve',
        comment: 'Owner approved a too-small compare budget.'
      })
    } catch {
      // The failed execution is the state we want to surface in the workbench.
    }
  } finally {
    session.close()
  }
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

test('objective workbench shows blocked runtime visibility when subagent budget is exhausted', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-subagent-budget-e2e-'))
  await seedBudgetLimitedObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  await page.getByRole('button', { name: 'Objective Workbench' }).click()
  await expect(page.getByRole('heading', { name: 'Objective Workbench' })).toBeVisible()
  await expect(page.getByText('Surface bounded compare budget failures').first()).toBeVisible()
  await expect(page.getByText(/compare analyst failed/i)).toBeVisible()
  await expect(page.getByText(/remaining budget is exhausted/i)).toBeVisible()

  await electronApp.close()
})
