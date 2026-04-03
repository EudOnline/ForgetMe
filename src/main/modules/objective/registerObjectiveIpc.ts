import type { AppPaths } from '../../services/appPaths'
import { registerObjectiveHandlers } from './ipc/handlers'

export function registerObjectiveIpc(appPaths: AppPaths) {
  registerObjectiveHandlers(appPaths)
}
