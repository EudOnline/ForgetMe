import fs from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerArchiveIpc } from './ipc/archiveIpc'
import { registerContextPackIpc } from './ipc/contextPackIpc'
import { registerPreservationIpc } from './ipc/preservationIpc'
import { registerEnrichmentIpc } from './ipc/enrichmentIpc'
import { registerMemoryWorkspaceIpc } from './ipc/memoryWorkspaceIpc'
import { registerPeopleIpc } from './ipc/peopleIpc'
import { registerReviewIpc } from './ipc/reviewIpc'
import { registerSearchIpc } from './ipc/searchIpc'
import { ensureAppPaths } from './services/appPaths'
import { createEnrichmentRunner } from './services/enrichmentRunnerService'

const resolveAppDataRoot = () => {
  if (process.env.FORGETME_E2E_USER_DATA_DIR) {
    return process.env.FORGETME_E2E_USER_DATA_DIR
  }

  if (app.isPackaged) {
    return app.getPath('userData')
  }

  return join(process.cwd(), '.local-dev', 'forgetme')
}

const resolvePreloadPath = () => {
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
      contextIsolation: false,
      nodeIntegration: true
    }
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

let enrichmentRunner: ReturnType<typeof createEnrichmentRunner> | null = null

app.whenReady().then(() => {
  const appPaths = ensureAppPaths(resolveAppDataRoot())
  registerArchiveIpc(appPaths)
  registerContextPackIpc(appPaths)
  registerPreservationIpc(appPaths)
  registerEnrichmentIpc(appPaths)
  registerMemoryWorkspaceIpc(appPaths)
  registerPeopleIpc(appPaths)
  registerReviewIpc(appPaths)
  registerSearchIpc(appPaths)
  enrichmentRunner = createEnrichmentRunner({ appPaths })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  enrichmentRunner?.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
