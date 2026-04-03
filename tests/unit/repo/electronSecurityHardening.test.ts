import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const readRepoFile = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('electron security hardening', () => {
  it('uses an isolated preload-only BrowserWindow configuration', () => {
    const source = readRepoFile('src/main/index.ts')

    expect(source).toContain('contextIsolation: true')
    expect(source).toContain('nodeIntegration: false')
    expect(source).toContain('sandbox: true')
    expect(source).not.toContain('contextIsolation: false')
    expect(source).not.toContain('nodeIntegration: true')
    expect(source).toContain("setWindowOpenHandler(() => ({ action: 'deny' }))")
    expect(source).toContain("window.webContents.on('will-navigate'")
  })

  it('forces preload output to CommonJS for sandbox compatibility', () => {
    const source = readRepoFile('electron.vite.config.ts')

    expect(source).toContain("formats: ['cjs']")
  })

  it('keeps the renderer archive api free of renderer-side Electron access', () => {
    const source = readRepoFile('src/renderer/archiveApi.ts')

    expect(source).not.toContain('window.require')
    expect(source).not.toContain('ipcRenderer')
    expect(source).not.toContain('createIpcArchiveApi')
  })

  it('declares a renderer content security policy', () => {
    const source = readRepoFile('src/renderer/index.html')

    expect(source).toContain('Content-Security-Policy')
  })
})
