import type { MainServiceContainer } from './serviceContainer'
import { registerImportIpc } from '../modules/import/registerImportIpc'
import { registerOpsIpc } from '../modules/ops/registerOpsIpc'
import { registerPeopleIpc } from '../modules/people/registerPeopleIpc'
import { registerReviewIpc } from '../modules/review/registerReviewIpc'
import { registerWorkspaceIpc } from '../modules/workspace/registerWorkspaceIpc'

export function registerIpc(container: Pick<MainServiceContainer, 'appPaths'>) {
  registerImportIpc(container.appPaths)
  registerOpsIpc(container.appPaths)
  registerPeopleIpc(container.appPaths)
  registerReviewIpc(container.appPaths)
  registerWorkspaceIpc(container.appPaths)
}
