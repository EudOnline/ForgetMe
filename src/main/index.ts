import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerArchiveIpc } from './ipc/archiveIpc'
import { ensureAppPaths } from './services/appPaths'

const resolveAppDataRoot = () => {
  if (app.isPackaged) {
    return app.getPath('userData')
  }

  return join(process.cwd(), '.local-dev', 'forgetme')
}

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js')
    }
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
