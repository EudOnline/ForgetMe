import type { ArchiveApi } from '../../shared/archiveContracts'
import type { IpcRenderer } from 'electron'
import { invokeWith, invokeWithout } from './helpers'

type WorkspacePreloadModule = Pick<
  ArchiveApi,
  | 'askMemoryWorkspace'
  | 'listMemoryWorkspaceSessions'
  | 'getMemoryWorkspaceSession'
  | 'askMemoryWorkspacePersisted'
  | 'getPersonAgentState'
  | 'listPersonAgentRefreshQueue'
  | 'listPersonAgentAuditEvents'
  | 'getPersonAgentMemorySummary'
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

export function createWorkspacePreloadModule(ipcRenderer: IpcRenderer): WorkspacePreloadModule {
  return {
    askMemoryWorkspace: invokeWith(ipcRenderer, 'archive:askMemoryWorkspace'),
    listMemoryWorkspaceSessions: invokeWith(ipcRenderer, 'archive:listMemoryWorkspaceSessions'),
    getMemoryWorkspaceSession: (sessionId) => ipcRenderer.invoke('archive:getMemoryWorkspaceSession', { sessionId }),
    askMemoryWorkspacePersisted: invokeWith(ipcRenderer, 'archive:askMemoryWorkspacePersisted'),
    getPersonAgentState: invokeWith(ipcRenderer, 'archive:getPersonAgentState'),
    listPersonAgentRefreshQueue: invokeWith(ipcRenderer, 'archive:listPersonAgentRefreshQueue'),
    listPersonAgentAuditEvents: invokeWith(ipcRenderer, 'archive:listPersonAgentAuditEvents'),
    getPersonAgentMemorySummary: invokeWith(ipcRenderer, 'archive:getPersonAgentMemorySummary'),
    runMemoryWorkspaceCompare: invokeWith(ipcRenderer, 'archive:runMemoryWorkspaceCompare'),
    listMemoryWorkspaceCompareSessions: invokeWith(ipcRenderer, 'archive:listMemoryWorkspaceCompareSessions'),
    getMemoryWorkspaceCompareSession: (compareSessionId) => ipcRenderer.invoke('archive:getMemoryWorkspaceCompareSession', { compareSessionId }),
    runMemoryWorkspaceCompareMatrix: invokeWith(ipcRenderer, 'archive:runMemoryWorkspaceCompareMatrix'),
    listMemoryWorkspaceCompareMatrices: invokeWithout(ipcRenderer, 'archive:listMemoryWorkspaceCompareMatrices'),
    getMemoryWorkspaceCompareMatrix: (matrixSessionId) => ipcRenderer.invoke('archive:getMemoryWorkspaceCompareMatrix', { matrixSessionId }),
    getPersonaDraftReviewByTurn: (turnId) => ipcRenderer.invoke('archive:getPersonaDraftReviewByTurn', { turnId }),
    createPersonaDraftReviewFromTurn: (turnId) => ipcRenderer.invoke('archive:createPersonaDraftReviewFromTurn', { turnId }),
    updatePersonaDraftReview: invokeWith(ipcRenderer, 'archive:updatePersonaDraftReview'),
    transitionPersonaDraftReview: invokeWith(ipcRenderer, 'archive:transitionPersonaDraftReview'),
    selectPersonaDraftHandoffDestination: invokeWithout(ipcRenderer, 'archive:selectPersonaDraftHandoffDestination'),
    listApprovedPersonaDraftHandoffs: invokeWith(ipcRenderer, 'archive:listApprovedPersonaDraftHandoffs'),
    exportApprovedPersonaDraft: invokeWith(ipcRenderer, 'archive:exportApprovedPersonaDraft'),
    selectApprovedDraftPublicationDestination: invokeWithout(ipcRenderer, 'archive:selectApprovedDraftPublicationDestination'),
    listApprovedPersonaDraftPublications: invokeWith(ipcRenderer, 'archive:listApprovedPersonaDraftPublications'),
    publishApprovedPersonaDraft: invokeWith(ipcRenderer, 'archive:publishApprovedPersonaDraft'),
    openApprovedDraftPublicationEntry: invokeWith(ipcRenderer, 'archive:openApprovedDraftPublicationEntry'),
    getApprovedDraftHostedShareHostStatus: invokeWithout(ipcRenderer, 'archive:getApprovedDraftHostedShareHostStatus'),
    listApprovedPersonaDraftHostedShareLinks: invokeWith(ipcRenderer, 'archive:listApprovedPersonaDraftHostedShareLinks'),
    createApprovedPersonaDraftHostedShareLink: invokeWith(ipcRenderer, 'archive:createApprovedPersonaDraftHostedShareLink'),
    revokeApprovedPersonaDraftHostedShareLink: invokeWith(ipcRenderer, 'archive:revokeApprovedPersonaDraftHostedShareLink'),
    openApprovedDraftHostedShareLink: invokeWith(ipcRenderer, 'archive:openApprovedDraftHostedShareLink'),
    listApprovedDraftSendDestinations: invokeWithout(ipcRenderer, 'archive:listApprovedDraftSendDestinations'),
    listApprovedPersonaDraftProviderSends: invokeWith(ipcRenderer, 'archive:listApprovedPersonaDraftProviderSends'),
    sendApprovedPersonaDraftToProvider: invokeWith(ipcRenderer, 'archive:sendApprovedPersonaDraftToProvider'),
    retryApprovedPersonaDraftProviderSend: invokeWith(ipcRenderer, 'archive:retryApprovedPersonaDraftProviderSend')
  }
}
