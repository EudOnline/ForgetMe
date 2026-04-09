import type { AppPaths } from '../services/appPaths'
import { createApprovedDraftProviderSendRetryRunner } from '../services/approvedDraftProviderSendRetryRunnerService'
import { createEnrichmentRunner } from '../services/enrichmentRunnerService'
import { createPersonAgentTaskQueueRunner } from '../services/personAgentTaskQueueRunnerService'

export type MainBackgroundRunners = {
  enrichmentRunner: ReturnType<typeof createEnrichmentRunner>
  approvedDraftProviderSendRetryRunner: ReturnType<typeof createApprovedDraftProviderSendRetryRunner>
  personAgentTaskQueueRunner: ReturnType<typeof createPersonAgentTaskQueueRunner>
}

export type MainServiceContainer = {
  appPaths: AppPaths
  startBackgroundRunners: () => MainBackgroundRunners
}

export function createServiceContainer(appPaths: AppPaths): MainServiceContainer {
  return {
    appPaths,
    startBackgroundRunners() {
      return {
        enrichmentRunner: createEnrichmentRunner({ appPaths }),
        approvedDraftProviderSendRetryRunner: createApprovedDraftProviderSendRetryRunner({ appPaths }),
        personAgentTaskQueueRunner: createPersonAgentTaskQueueRunner({ appPaths })
      }
    }
  }
}
