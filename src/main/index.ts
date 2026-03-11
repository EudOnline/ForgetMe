import fs from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerArchiveIpc } from './ipc/archiveIpc'
import { registerEnrichmentIpc } from './ipc/enrichmentIpc'
import { registerPeopleIpc } from './ipc/peopleIpc'
import { registerReviewIpc } from './ipc/reviewIpc'
import { registerSearchIpc } from './ipc/searchIpc'
import { ensureAppPaths } from './services/appPaths'

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

app.whenReady().then(() => {
  const appPaths = ensureAppPaths(resolveAppDataRoot())
  registerArchiveIpc(appPaths)
  registerEnrichmentIpc(appPaths)
  registerPeopleIpc(appPaths)
  registerReviewIpc(appPaths)
  registerSearchIpc(appPaths)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
