import type { ArchiveApi } from '../../shared/archiveContracts'
import type { IpcRenderer } from 'electron'
import { invokeWith, invokeWithout } from './helpers'

type PeoplePreloadModule = Pick<
  ArchiveApi,
  | 'selectContextPackExportDestination'
  | 'listCanonicalPeople'
  | 'getCanonicalPerson'
  | 'getPersonDossier'
  | 'getPersonContextPack'
  | 'listGroupPortraits'
  | 'getGroupPortrait'
  | 'getGroupContextPack'
  | 'exportPersonContextPack'
  | 'exportGroupContextPack'
  | 'getPersonTimeline'
  | 'getPersonGraph'
  | 'listPersonProfileAttributes'
  | 'listProfileAttributeCandidates'
  | 'approveProfileAttributeCandidate'
  | 'rejectProfileAttributeCandidate'
  | 'undoProfileAttributeDecision'
  | 'setRelationshipLabel'
>

export function createPeoplePreloadModule(ipcRenderer: IpcRenderer): PeoplePreloadModule {
  return {
    selectContextPackExportDestination: invokeWithout(ipcRenderer, 'archive:selectContextPackExportDestination'),
    listCanonicalPeople: invokeWithout(ipcRenderer, 'archive:listCanonicalPeople'),
    getCanonicalPerson: (canonicalPersonId) => ipcRenderer.invoke('archive:getCanonicalPerson', { canonicalPersonId }),
    getPersonDossier: (canonicalPersonId) => ipcRenderer.invoke('archive:getPersonDossier', { canonicalPersonId }),
    getPersonContextPack: invokeWith(ipcRenderer, 'archive:getPersonContextPack'),
    listGroupPortraits: invokeWithout(ipcRenderer, 'archive:listGroupPortraits'),
    getGroupPortrait: (canonicalPersonId) => ipcRenderer.invoke('archive:getGroupPortrait', { canonicalPersonId }),
    getGroupContextPack: invokeWith(ipcRenderer, 'archive:getGroupContextPack'),
    exportPersonContextPack: invokeWith(ipcRenderer, 'archive:exportPersonContextPack'),
    exportGroupContextPack: invokeWith(ipcRenderer, 'archive:exportGroupContextPack'),
    getPersonTimeline: (canonicalPersonId) => ipcRenderer.invoke('archive:getPersonTimeline', { canonicalPersonId }),
    getPersonGraph: (canonicalPersonId) => ipcRenderer.invoke('archive:getPersonGraph', { canonicalPersonId }),
    listPersonProfileAttributes: invokeWith(ipcRenderer, 'archive:listPersonProfileAttributes'),
    listProfileAttributeCandidates: invokeWith(ipcRenderer, 'archive:listProfileAttributeCandidates'),
    approveProfileAttributeCandidate: (queueItemId) => ipcRenderer.invoke('archive:approveProfileAttributeCandidate', { queueItemId }),
    rejectProfileAttributeCandidate: invokeWith(ipcRenderer, 'archive:rejectProfileAttributeCandidate'),
    undoProfileAttributeDecision: (journalId) => ipcRenderer.invoke('archive:undoProfileAttributeDecision', { journalId }),
    setRelationshipLabel: invokeWith(ipcRenderer, 'archive:setRelationshipLabel')
  }
}
