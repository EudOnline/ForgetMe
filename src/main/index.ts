import fs from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerIpc } from './bootstrap/registerIpc'
import { createServiceContainer } from './bootstrap/serviceContainer'
import { ensureAppPaths } from './services/appPaths'

const e2eUserDataDir = process.env.FORGETME_E2E_USER_DATA_DIR?.trim() || null

if (e2eUserDataDir) {
  app.setPath('userData', e2eUserDataDir)
}

const resolveAppDataRoot = () => {
  if (e2eUserDataDir) {
    return e2eUserDataDir
  }

  if (app.isPackaged) {
    return app.getPath('userData')
  }

  return join(process.cwd(), '.local-dev', 'forgetme')
}

const resolvePreloadPath = () => {
  const cjsPath = join(__dirname, '../preload/index.cjs')
  if (fs.existsSync(cjsPath)) {
    return cjsPath
  }

  const mjsPath = join(__dirname, '../preload/index.mjs')
  if (fs.existsSync(mjsPath)) {
    return mjsPath
  }

  return join(__dirname, '../preload/index.js')
}

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    const currentUrl = window.webContents.getURL()
    if (!currentUrl || url === currentUrl) {
      return
    }

    event.preventDefault()
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

let backgroundRunners: ReturnType<ReturnType<typeof createServiceContainer>['startBackgroundRunners']> | null = null

app.whenReady().then(() => {
  const appPaths = ensureAppPaths(resolveAppDataRoot())
  const serviceContainer = createServiceContainer(appPaths)
  registerIpc(serviceContainer)
  backgroundRunners = serviceContainer.startBackgroundRunners()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  backgroundRunners?.enrichmentRunner.stop()
  backgroundRunners?.approvedDraftProviderSendRetryRunner.stop()
  backgroundRunners?.personAgentTaskQueueRunner.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
