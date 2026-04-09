import type { AppPaths } from '../services/appPaths'
import { createApprovedDraftProviderSendRetryRunner } from '../services/approvedDraftProviderSendRetryRunnerService'
import { createEnrichmentRunner } from '../services/enrichmentRunnerService'
import {
  createPersonAgentRuntimeRunner,
  runPersonAgentRuntimeStartupRepairs
} from '../services/personAgentRuntimeRunnerService'

export type MainBackgroundRunners = {
  enrichmentRunner: ReturnType<typeof createEnrichmentRunner>
  approvedDraftProviderSendRetryRunner: ReturnType<typeof createApprovedDraftProviderSendRetryRunner>
  personAgentRuntimeRunner: ReturnType<typeof createPersonAgentRuntimeRunner>
}

export type MainServiceContainer = {
  appPaths: AppPaths
  runStartupRepairs: () => ReturnType<typeof runPersonAgentRuntimeStartupRepairs>
  startBackgroundRunners: () => MainBackgroundRunners
}

export function createServiceContainer(appPaths: AppPaths): MainServiceContainer {
  return {
    appPaths,
    runStartupRepairs() {
      return runPersonAgentRuntimeStartupRepairs({ appPaths })
    },
    startBackgroundRunners() {
      return {
        enrichmentRunner: createEnrichmentRunner({ appPaths }),
        approvedDraftProviderSendRetryRunner: createApprovedDraftProviderSendRetryRunner({ appPaths }),
        personAgentRuntimeRunner: createPersonAgentRuntimeRunner({ appPaths })
      }
    }
  }
}
