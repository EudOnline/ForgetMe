import type { ArchiveApi } from '../../shared/archiveContracts'
import type { IpcRenderer } from 'electron'
import { invokeWith, invokeWithout } from './helpers'

type ObjectivePreloadModule = Pick<
  ArchiveApi,
  | 'createAgentObjective'
  | 'refreshObjectiveTriggers'
  | 'listAgentObjectives'
  | 'getAgentObjective'
  | 'getAgentThread'
  | 'respondToAgentProposal'
  | 'confirmAgentProposal'
  | 'getObjectiveRuntimeScorecard'
  | 'listObjectiveRuntimeEvents'
  | 'listObjectiveRuntimeAlerts'
  | 'acknowledgeObjectiveRuntimeAlert'
  | 'resolveObjectiveRuntimeAlert'
  | 'getObjectiveRuntimeSettings'
  | 'updateObjectiveRuntimeSettings'
  | 'listAgentMemories'
  | 'listAgentPolicyVersions'
>

export function createObjectivePreloadModule(ipcRenderer: IpcRenderer): ObjectivePreloadModule {
  return {
    createAgentObjective: invokeWith(ipcRenderer, 'archive:createAgentObjective'),
    refreshObjectiveTriggers: invokeWithout(ipcRenderer, 'archive:refreshObjectiveTriggers'),
    listAgentObjectives: invokeWith(ipcRenderer, 'archive:listAgentObjectives'),
    getAgentObjective: invokeWith(ipcRenderer, 'archive:getAgentObjective'),
    getAgentThread: invokeWith(ipcRenderer, 'archive:getAgentThread'),
    respondToAgentProposal: invokeWith(ipcRenderer, 'archive:respondToAgentProposal'),
    confirmAgentProposal: invokeWith(ipcRenderer, 'archive:confirmAgentProposal'),
    getObjectiveRuntimeScorecard: invokeWithout(ipcRenderer, 'archive:getObjectiveRuntimeScorecard'),
    listObjectiveRuntimeEvents: invokeWith(ipcRenderer, 'archive:listObjectiveRuntimeEvents'),
    listObjectiveRuntimeAlerts: invokeWith(ipcRenderer, 'archive:listObjectiveRuntimeAlerts'),
    acknowledgeObjectiveRuntimeAlert: invokeWith(ipcRenderer, 'archive:acknowledgeObjectiveRuntimeAlert'),
    resolveObjectiveRuntimeAlert: invokeWith(ipcRenderer, 'archive:resolveObjectiveRuntimeAlert'),
    getObjectiveRuntimeSettings: invokeWithout(ipcRenderer, 'archive:getObjectiveRuntimeSettings'),
    updateObjectiveRuntimeSettings: invokeWith(ipcRenderer, 'archive:updateObjectiveRuntimeSettings'),
    listAgentMemories: invokeWith(ipcRenderer, 'archive:listAgentMemories'),
    listAgentPolicyVersions: invokeWith(ipcRenderer, 'archive:listAgentPolicyVersions')
  }
}
