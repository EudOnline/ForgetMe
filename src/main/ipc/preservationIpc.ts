import { dialog, ipcMain } from 'electron'
import type { AppPaths } from '../services/appPaths'
import { createBackupExport } from '../services/backupExportService'
import { restoreBackupExport } from '../services/restoreService'
import { backupExportInputSchema, restoreBackupInputSchema } from '../../shared/ipcSchemas'

async function selectDirectory(envKey: string) {
  const envValue = process.env[envKey]
  if (envValue) {
    return envValue
  }

  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })

  return result.canceled ? null : result.filePaths[0] ?? null
}

export function registerPreservationIpc(appPaths: AppPaths) {
  ipcMain.removeHandler('archive:selectBackupExportDestination')
  ipcMain.removeHandler('archive:selectBackupExportSource')
  ipcMain.removeHandler('archive:selectRestoreTargetDirectory')
  ipcMain.removeHandler('archive:createBackupExport')
  ipcMain.removeHandler('archive:restoreBackupExport')

  ipcMain.handle('archive:selectBackupExportDestination', async () => selectDirectory('FORGETME_E2E_BACKUP_DESTINATION_DIR'))
  ipcMain.handle('archive:selectBackupExportSource', async () => selectDirectory('FORGETME_E2E_BACKUP_SOURCE_DIR'))
  ipcMain.handle('archive:selectRestoreTargetDirectory', async () => selectDirectory('FORGETME_E2E_RESTORE_TARGET_DIR'))

  ipcMain.handle('archive:createBackupExport', async (_event, payload) => {
    const input = backupExportInputSchema.parse(payload)
    return createBackupExport({ appPaths, ...input })
  })

  ipcMain.handle('archive:restoreBackupExport', async (_event, payload) => {
    const input = restoreBackupInputSchema.parse(payload)
    return restoreBackupExport(input)
  })
}
