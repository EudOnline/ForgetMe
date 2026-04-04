import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createObjectiveRuntimeSettingsService } from '../../../src/main/services/objectiveRuntimeSettingsService'

function createDatabasePath() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-runtime-settings-'))
  return path.join(root, 'archive.sqlite')
}

function openMigratedDatabase(filename: string) {
  const db = openDatabase(filename)
  runMigrations(db)
  return db
}

describe('objective runtime settings service', () => {
  it('returns persisted defaults that match the current runtime behavior', () => {
    const db = openMigratedDatabase(createDatabasePath())
    const service = createObjectiveRuntimeSettingsService({ db })

    expect(service.getRuntimeSettings()).toMatchObject({
      disableAutoCommit: false,
      forceOperatorForExternalActions: false,
      disableNestedDelegation: false
    })

    db.close()
  })

  it('persists runtime settings across fresh database sessions', () => {
    const filename = createDatabasePath()
    const firstDb = openMigratedDatabase(filename)
    const firstService = createObjectiveRuntimeSettingsService({ db: firstDb })

    firstService.updateRuntimeSettings(
      {
        disableAutoCommit: true,
        forceOperatorForExternalActions: true
      },
      {
        actor: 'operator'
      }
    )
    firstDb.close()

    const secondDb = openMigratedDatabase(filename)
    const secondService = createObjectiveRuntimeSettingsService({ db: secondDb })

    expect(secondService.getRuntimeSettings()).toMatchObject({
      disableAutoCommit: true,
      forceOperatorForExternalActions: true,
      disableNestedDelegation: false
    })

    secondDb.close()
  })

  it('applies partial updates without clobbering unrelated settings', () => {
    const db = openMigratedDatabase(createDatabasePath())
    const service = createObjectiveRuntimeSettingsService({ db })

    service.updateRuntimeSettings(
      {
        disableAutoCommit: true,
        disableNestedDelegation: true
      },
      {
        actor: 'operator'
      }
    )
    service.updateRuntimeSettings(
      {
        forceOperatorForExternalActions: true
      },
      {
        actor: 'operator'
      }
    )

    expect(service.getRuntimeSettings()).toMatchObject({
      disableAutoCommit: true,
      forceOperatorForExternalActions: true,
      disableNestedDelegation: true
    })

    db.close()
  })

  it('records audit evidence for every settings write', () => {
    const db = openMigratedDatabase(createDatabasePath())
    const service = createObjectiveRuntimeSettingsService({ db })

    service.updateRuntimeSettings(
      {
        disableAutoCommit: true,
        forceOperatorForExternalActions: true
      },
      {
        actor: 'operator'
      }
    )
    service.updateRuntimeSettings(
      {
        disableNestedDelegation: true
      },
      {
        actor: 'operator'
      }
    )

    expect(service.listRuntimeSettingEvents()).toEqual([
      expect.objectContaining({
        settingKey: 'disableAutoCommit',
        previousValue: false,
        nextValue: true,
        actor: 'operator'
      }),
      expect.objectContaining({
        settingKey: 'forceOperatorForExternalActions',
        previousValue: false,
        nextValue: true,
        actor: 'operator'
      }),
      expect.objectContaining({
        settingKey: 'disableNestedDelegation',
        previousValue: false,
        nextValue: true,
        actor: 'operator'
      })
    ])

    db.close()
  })
})
