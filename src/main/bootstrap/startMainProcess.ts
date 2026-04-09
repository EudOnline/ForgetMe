import type { MainBackgroundRunners, MainServiceContainer } from './serviceContainer'

export async function initializeMainProcess(input: {
  serviceContainer: MainServiceContainer
  registerIpc: (serviceContainer: MainServiceContainer) => void
  createWindow: () => void
  onStartupRepairError?: (error: unknown) => void
}): Promise<MainBackgroundRunners> {
  input.registerIpc(input.serviceContainer)

  try {
    await Promise.resolve(input.serviceContainer.runStartupRepairs())
  } catch (error) {
    input.onStartupRepairError?.(error)
  }

  const backgroundRunners = input.serviceContainer.startBackgroundRunners()
  input.createWindow()
  return backgroundRunners
}
