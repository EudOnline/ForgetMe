import { contextBridge, ipcRenderer } from 'electron'
import { createImportPreloadModule } from './modules/import'
import { createOpsPreloadModule } from './modules/ops'
import { createPeoplePreloadModule } from './modules/people'
import { createReviewPreloadModule } from './modules/review'
import { createWorkspacePreloadModule } from './modules/workspace'

contextBridge.exposeInMainWorld(
  'archiveApi',
  Object.assign(
    {},
    createImportPreloadModule(ipcRenderer),
    createPeoplePreloadModule(ipcRenderer),
    createReviewPreloadModule(ipcRenderer),
    createWorkspacePreloadModule(ipcRenderer),
    createOpsPreloadModule(ipcRenderer)
  )
)
