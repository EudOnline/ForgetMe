import type { AppPaths } from '../services/appPaths'
import { createApprovedDraftProviderSendRetryRunner } from '../services/approvedDraftProviderSendRetryRunnerService'
import { createEnrichmentRunner } from '../services/enrichmentRunnerService'

export type MainBackgroundRunners = {
  enrichmentRunner: ReturnType<typeof createEnrichmentRunner>
  approvedDraftProviderSendRetryRunner: ReturnType<typeof createApprovedDraftProviderSendRetryRunner>
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
        approvedDraftProviderSendRetryRunner: createApprovedDraftProviderSendRetryRunner({ appPaths })
      }
    }
  }
}
