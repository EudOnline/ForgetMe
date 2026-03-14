import path from 'node:path'
import { dialog, ipcMain } from 'electron'
import {
  groupContextPackExportInputSchema,
  groupContextPackInputSchema,
  personContextPackExportInputSchema,
  personContextPackInputSchema
} from '../../shared/ipcSchemas'
import type { AppPaths } from '../services/appPaths'
import { openDatabase, runMigrations } from '../services/db'
import {
  buildGroupContextPack,
  buildPersonContextPack,
  exportContextPackToDirectory
} from '../services/contextPackService'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

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

export function registerContextPackIpc(appPaths: AppPaths) {
  ipcMain.removeHandler('archive:selectContextPackExportDestination')
  ipcMain.removeHandler('archive:getPersonContextPack')
  ipcMain.removeHandler('archive:getGroupContextPack')
  ipcMain.removeHandler('archive:exportPersonContextPack')
  ipcMain.removeHandler('archive:exportGroupContextPack')

  ipcMain.handle('archive:selectContextPackExportDestination', async () => selectDirectory('FORGETME_E2E_CONTEXT_PACK_DESTINATION_DIR'))

  ipcMain.handle('archive:getPersonContextPack', async (_event, payload) => {
    const input = personContextPackInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)

    try {
      return buildPersonContextPack(db, input)
    } finally {
      db.close()
    }
  })

  ipcMain.handle('archive:getGroupContextPack', async (_event, payload) => {
    const input = groupContextPackInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)

    try {
      return buildGroupContextPack(db, input)
    } finally {
      db.close()
    }
  })

  ipcMain.handle('archive:exportPersonContextPack', async (_event, payload) => {
    const input = personContextPackExportInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)

    try {
      const pack = buildPersonContextPack(db, {
        canonicalPersonId: input.canonicalPersonId,
        mode: input.mode
      })

      if (!pack) {
        return null
      }

      return exportContextPackToDirectory({
        destinationRoot: input.destinationRoot,
        pack
      })
    } finally {
      db.close()
    }
  })

  ipcMain.handle('archive:exportGroupContextPack', async (_event, payload) => {
    const input = groupContextPackExportInputSchema.parse(payload)
    const db = openDatabase(databasePath(appPaths))
    runMigrations(db)

    try {
      const pack = buildGroupContextPack(db, {
        anchorPersonId: input.anchorPersonId,
        mode: input.mode
      })

      if (!pack) {
        return null
      }

      return exportContextPackToDirectory({
        destinationRoot: input.destinationRoot,
        pack
      })
    } finally {
      db.close()
    }
  })
}
