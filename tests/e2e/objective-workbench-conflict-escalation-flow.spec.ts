import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import { ensureAppPaths } from '../../src/main/services/appPaths'
import { createExternalVerificationBrokerService } from '../../src/main/services/externalVerificationBrokerService'
import { createObjectiveModule } from '../../src/main/modules/objective/runtime/createObjectiveModule'
import { createSubagentRegistryService } from '../../src/main/services/subagentRegistryService'

async function seedEvidenceGapObjective(userDataDir: string) {
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
    roleAgentRegistry: {
      get(role: string) {
        if (role === 'workspace') {
          return {
            role,
            async receive() {
              return {
                messages: [],
                proposals: [
                  {
                    proposalKind: 'verify_external_claim' as const,
                    payload: {
                      claim: 'The official source confirms the announcement date.',
                      query: 'official announcement date'
                    },
                    ownerRole: 'workspace' as const,
                    requiredApprovals: ['workspace' as const],
                    allowVetoBy: ['governance' as const],
                    toolPolicyId: 'external-verification-policy',
                    budget: {
                      maxRounds: 2,
                      maxToolCalls: 3,
                      timeoutMs: 30_000
                    }
                  }
                ]
              }
            }
          }
        }

        return {
          role,
          async receive() {
            return {
              messages: []
            }
          }
        }
      }
    } as any
  })
  const { runtime } = session

  try {
    await runtime.startObjective({
      title: 'Escalate to evidence instead of looping',
      objectiveKind: 'evidence_investigation',
      prompt: 'Pause once the facilitator knows the thread needs external verification.',
      initiatedBy: 'operator'
    })
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

test('objective workbench shows planner-driven evidence escalation', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-conflict-escalation-e2e-'))
  await seedEvidenceGapObjective(userDataDir)

  const electronApp = await launchApp(userDataDir)
  const page = await electronApp.firstWindow()

  await page.getByRole('button', { name: 'Objective Workbench' }).click()
  await expect(page.getByRole('heading', { name: 'Objective Workbench' })).toBeVisible()
  await expect(page.getByText('Escalate to evidence instead of looping').first()).toBeVisible()
  await expect(page.getByText('External verification requested', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/objective status:\s*in progress/i)).toBeVisible()
  await expect(page.getByText(/thread status:\s*waiting/i)).toBeVisible()

  await electronApp.close()
})
