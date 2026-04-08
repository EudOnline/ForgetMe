import type {
  ApprovedDraftHostedShareHostStatus,
  ApprovedPersonaDraftHandoffRecord,
  ApprovedPersonaDraftHostedShareLinkRecord,
  ApprovedPersonaDraftProviderSendArtifact,
  ArchiveApi,
  ExportApprovedPersonaDraftResult
} from '../../shared/archiveContracts'
import { bridgeMethod } from './clientHelpers'

type WorkspaceClient = Pick<
  ArchiveApi,
  | 'askMemoryWorkspace'
  | 'listMemoryWorkspaceSessions'
  | 'getMemoryWorkspaceSession'
  | 'askMemoryWorkspacePersisted'
  | 'getPersonAgentState'
  | 'listPersonAgentRefreshQueue'
  | 'listPersonAgentAuditEvents'
  | 'getPersonAgentMemorySummary'
  | 'getPersonAgentInspectionBundle'
  | 'runMemoryWorkspaceCompare'
  | 'listMemoryWorkspaceCompareSessions'
  | 'getMemoryWorkspaceCompareSession'
  | 'runMemoryWorkspaceCompareMatrix'
  | 'listMemoryWorkspaceCompareMatrices'
  | 'getMemoryWorkspaceCompareMatrix'
  | 'getPersonaDraftReviewByTurn'
  | 'createPersonaDraftReviewFromTurn'
  | 'updatePersonaDraftReview'
  | 'transitionPersonaDraftReview'
  | 'selectPersonaDraftHandoffDestination'
  | 'listApprovedPersonaDraftHandoffs'
  | 'exportApprovedPersonaDraft'
  | 'selectApprovedDraftPublicationDestination'
  | 'listApprovedPersonaDraftPublications'
  | 'publishApprovedPersonaDraft'
  | 'openApprovedDraftPublicationEntry'
  | 'getApprovedDraftHostedShareHostStatus'
  | 'listApprovedPersonaDraftHostedShareLinks'
  | 'createApprovedPersonaDraftHostedShareLink'
  | 'revokeApprovedPersonaDraftHostedShareLink'
  | 'openApprovedDraftHostedShareLink'
  | 'listApprovedDraftSendDestinations'
  | 'listApprovedPersonaDraftProviderSends'
  | 'sendApprovedPersonaDraftToProvider'
  | 'retryApprovedPersonaDraftProviderSend'
>

export function getWorkspaceClient(): WorkspaceClient {
  return {
    askMemoryWorkspace: bridgeMethod('askMemoryWorkspace', async () => null),
    listMemoryWorkspaceSessions: bridgeMethod('listMemoryWorkspaceSessions', async () => []),
    getMemoryWorkspaceSession: bridgeMethod('getMemoryWorkspaceSession', async () => null),
    askMemoryWorkspacePersisted: bridgeMethod('askMemoryWorkspacePersisted', async () => null),
    getPersonAgentState: bridgeMethod('getPersonAgentState', async () => null),
    listPersonAgentRefreshQueue: bridgeMethod('listPersonAgentRefreshQueue', async () => []),
    listPersonAgentAuditEvents: bridgeMethod('listPersonAgentAuditEvents', async () => []),
    getPersonAgentMemorySummary: bridgeMethod('getPersonAgentMemorySummary', async () => null),
    getPersonAgentInspectionBundle: bridgeMethod('getPersonAgentInspectionBundle', async () => null),
    runMemoryWorkspaceCompare: bridgeMethod('runMemoryWorkspaceCompare', async () => null),
    listMemoryWorkspaceCompareSessions: bridgeMethod('listMemoryWorkspaceCompareSessions', async () => []),
    getMemoryWorkspaceCompareSession: bridgeMethod('getMemoryWorkspaceCompareSession', async () => null),
    runMemoryWorkspaceCompareMatrix: bridgeMethod('runMemoryWorkspaceCompareMatrix', async () => null),
    listMemoryWorkspaceCompareMatrices: bridgeMethod('listMemoryWorkspaceCompareMatrices', async () => []),
    getMemoryWorkspaceCompareMatrix: bridgeMethod('getMemoryWorkspaceCompareMatrix', async () => null),
    getPersonaDraftReviewByTurn: bridgeMethod('getPersonaDraftReviewByTurn', async () => null),
    createPersonaDraftReviewFromTurn: bridgeMethod('createPersonaDraftReviewFromTurn', async () => null),
    updatePersonaDraftReview: bridgeMethod('updatePersonaDraftReview', async () => null),
    transitionPersonaDraftReview: bridgeMethod('transitionPersonaDraftReview', async () => null),
    selectPersonaDraftHandoffDestination: bridgeMethod('selectPersonaDraftHandoffDestination', async () => null),
    listApprovedPersonaDraftHandoffs: bridgeMethod('listApprovedPersonaDraftHandoffs', async () => [] as ApprovedPersonaDraftHandoffRecord[]),
    exportApprovedPersonaDraft: bridgeMethod(
      'exportApprovedPersonaDraft',
      async (_input: { draftReviewId: string; destinationRoot: string }) => null as ExportApprovedPersonaDraftResult | null
    ),
    selectApprovedDraftPublicationDestination: bridgeMethod('selectApprovedDraftPublicationDestination', async () => null),
    listApprovedPersonaDraftPublications: bridgeMethod('listApprovedPersonaDraftPublications', async () => []),
    publishApprovedPersonaDraft: bridgeMethod('publishApprovedPersonaDraft', async (_input: { draftReviewId: string; destinationRoot: string }) => null),
    openApprovedDraftPublicationEntry: bridgeMethod(
      'openApprovedDraftPublicationEntry',
      async (input: { entryPath: string }) => ({
        status: 'failed' as const,
        entryPath: input.entryPath,
        errorMessage: 'archive api unavailable'
      })
    ),
    getApprovedDraftHostedShareHostStatus: bridgeMethod(
      'getApprovedDraftHostedShareHostStatus',
      async () => ({
        availability: 'unconfigured' as const,
        hostKind: null,
        hostLabel: null
      } as ApprovedDraftHostedShareHostStatus)
    ),
    listApprovedPersonaDraftHostedShareLinks: bridgeMethod(
      'listApprovedPersonaDraftHostedShareLinks',
      async () => [] as ApprovedPersonaDraftHostedShareLinkRecord[]
    ),
    createApprovedPersonaDraftHostedShareLink: bridgeMethod('createApprovedPersonaDraftHostedShareLink', async () => null),
    revokeApprovedPersonaDraftHostedShareLink: bridgeMethod('revokeApprovedPersonaDraftHostedShareLink', async () => null),
    openApprovedDraftHostedShareLink: bridgeMethod(
      'openApprovedDraftHostedShareLink',
      async (input: { shareUrl: string }) => ({
        status: 'failed' as const,
        shareUrl: input.shareUrl,
        errorMessage: 'archive api unavailable'
      })
    ),
    listApprovedDraftSendDestinations: bridgeMethod('listApprovedDraftSendDestinations', async () => []),
    listApprovedPersonaDraftProviderSends: bridgeMethod('listApprovedPersonaDraftProviderSends', async () => [] as ApprovedPersonaDraftProviderSendArtifact[]),
    sendApprovedPersonaDraftToProvider: bridgeMethod('sendApprovedPersonaDraftToProvider', async () => null),
    retryApprovedPersonaDraftProviderSend: bridgeMethod('retryApprovedPersonaDraftProviderSend', async () => null)
  }
}
