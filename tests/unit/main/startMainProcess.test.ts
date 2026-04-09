import { describe, expect, it, vi } from 'vitest'
import { initializeMainProcess } from '../../../src/main/bootstrap/startMainProcess'

describe('startMainProcess', () => {
  it('waits for startup repairs to finish before starting background runners and creating the window', async () => {
    const registerIpc = vi.fn()
    const createWindow = vi.fn()
    const startBackgroundRunners = vi.fn().mockReturnValue({
      enrichmentRunner: { stop: vi.fn() },
      approvedDraftProviderSendRetryRunner: { stop: vi.fn() },
      personAgentRuntimeRunner: { stop: vi.fn() }
    })
    let resolveStartupRepairs: (() => void) | null = null
    const runStartupRepairs = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      resolveStartupRepairs = resolve
    }))

    const startupPromise = initializeMainProcess({
      serviceContainer: {
        runStartupRepairs,
        startBackgroundRunners
      } as never,
      registerIpc,
      createWindow
    })

    expect(registerIpc).toHaveBeenCalledTimes(1)
    expect(runStartupRepairs).toHaveBeenCalledTimes(1)
    expect(startBackgroundRunners).not.toHaveBeenCalled()
    expect(createWindow).not.toHaveBeenCalled()

    resolveStartupRepairs?.()
    await startupPromise

    expect(startBackgroundRunners).toHaveBeenCalledTimes(1)
    expect(createWindow).toHaveBeenCalledTimes(1)
  })
})
