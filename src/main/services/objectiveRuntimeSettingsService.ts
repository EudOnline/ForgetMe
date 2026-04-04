import crypto from 'node:crypto'
import type { ArchiveDatabase } from './db'
import type {
  ObjectiveRuntimeSettingsRecord
} from '../../shared/objectiveRuntimeContracts'
import {
  DEFAULT_RUNTIME_CONFIG,
  type ObjectiveRuntimeConfig
} from './objectiveRuntimeConfigService'

const RUNTIME_SETTINGS_ID = 'runtime'

type RuntimeSettingsRow = {
  disableAutoCommit: number
  forceOperatorForExternalActions: number
  disableNestedDelegation: number
  updatedAt: string
  updatedBy: string
}

export type ObjectiveRuntimeSettingsPatch = Partial<ObjectiveRuntimeConfig>

export type ObjectiveRuntimeSettingEventRecord = {
  eventId: string
  settingKey: keyof ObjectiveRuntimeConfig
  previousValue: boolean
  nextValue: boolean
  actor: string
  createdAt: string
}

function nowIso() {
  return new Date().toISOString()
}

function asBoolean(value: number) {
  return value === 1
}

function asSqliteBoolean(value: boolean) {
  return value ? 1 : 0
}

function defaultSettingsRecord(): ObjectiveRuntimeSettingsRecord {
  return {
    ...DEFAULT_RUNTIME_CONFIG,
    updatedAt: null,
    updatedBy: null
  }
}

function pickRuntimeConfig(settings: ObjectiveRuntimeSettingsRecord): ObjectiveRuntimeConfig {
  return {
    disableAutoCommit: settings.disableAutoCommit,
    forceOperatorForExternalActions: settings.forceOperatorForExternalActions,
    disableNestedDelegation: settings.disableNestedDelegation
  }
}

export function createObjectiveRuntimeSettingsService(dependencies: {
  db: ArchiveDatabase
}) {
  const { db } = dependencies

  function readStoredSettings() {
    const row = db.prepare(
      `select
        disable_auto_commit as disableAutoCommit,
        force_operator_for_external_actions as forceOperatorForExternalActions,
        disable_nested_delegation as disableNestedDelegation,
        updated_at as updatedAt,
        updated_by as updatedBy
      from agent_runtime_settings
      where settings_id = ?`
    ).get(RUNTIME_SETTINGS_ID) as RuntimeSettingsRow | undefined

    if (!row) {
      return null
    }

    return {
      disableAutoCommit: asBoolean(row.disableAutoCommit),
      forceOperatorForExternalActions: asBoolean(row.forceOperatorForExternalActions),
      disableNestedDelegation: asBoolean(row.disableNestedDelegation),
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy
    } satisfies ObjectiveRuntimeSettingsRecord
  }

  function getRuntimeSettings(): ObjectiveRuntimeSettingsRecord {
    return readStoredSettings() ?? defaultSettingsRecord()
  }

  function updateRuntimeSettings(
    patch: ObjectiveRuntimeSettingsPatch,
    input: {
      actor: string
      updatedAt?: string
    }
  ) {
    const current = getRuntimeSettings()
    const nextConfig = {
      ...pickRuntimeConfig(current),
      ...Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined)
      )
    } satisfies ObjectiveRuntimeConfig

    const changedKeys = (Object.keys(DEFAULT_RUNTIME_CONFIG) as Array<keyof ObjectiveRuntimeConfig>)
      .filter((key) => patch[key] !== undefined && current[key] !== nextConfig[key])

    if (changedKeys.length === 0) {
      return current
    }

    const updatedAt = input.updatedAt ?? nowIso()
    const next = {
      ...nextConfig,
      updatedAt,
      updatedBy: input.actor
    } satisfies ObjectiveRuntimeSettingsRecord

    db.exec('begin immediate')

    try {
      db.prepare(
        `insert into agent_runtime_settings (
          settings_id,
          disable_auto_commit,
          force_operator_for_external_actions,
          disable_nested_delegation,
          updated_at,
          updated_by
        ) values (?, ?, ?, ?, ?, ?)
        on conflict(settings_id) do update set
          disable_auto_commit = excluded.disable_auto_commit,
          force_operator_for_external_actions = excluded.force_operator_for_external_actions,
          disable_nested_delegation = excluded.disable_nested_delegation,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by`
      ).run(
        RUNTIME_SETTINGS_ID,
        asSqliteBoolean(next.disableAutoCommit),
        asSqliteBoolean(next.forceOperatorForExternalActions),
        asSqliteBoolean(next.disableNestedDelegation),
        next.updatedAt,
        next.updatedBy
      )

      const insertEvent = db.prepare(
        `insert into agent_runtime_setting_events (
          id,
          settings_id,
          setting_key,
          previous_value,
          next_value,
          actor,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?)`
      )

      for (const settingKey of changedKeys) {
        insertEvent.run(
          crypto.randomUUID(),
          RUNTIME_SETTINGS_ID,
          settingKey,
          asSqliteBoolean(current[settingKey]),
          asSqliteBoolean(next[settingKey]),
          input.actor,
          updatedAt
        )
      }

      db.exec('commit')
      return next
    } catch (error) {
      db.exec('rollback')
      throw error
    }
  }

  function listRuntimeSettingEvents() {
    return db.prepare(
      `select
        id as eventId,
        setting_key as settingKey,
        previous_value as previousValue,
        next_value as nextValue,
        actor,
        created_at as createdAt
      from agent_runtime_setting_events
      where settings_id = ?
      order by created_at asc, rowid asc`
    ).all(RUNTIME_SETTINGS_ID).map((row) => ({
      eventId: (row as { eventId: string }).eventId,
      settingKey: (row as { settingKey: keyof ObjectiveRuntimeConfig }).settingKey,
      previousValue: asBoolean((row as { previousValue: number }).previousValue),
      nextValue: asBoolean((row as { nextValue: number }).nextValue),
      actor: (row as { actor: string }).actor,
      createdAt: (row as { createdAt: string }).createdAt
    })) as ObjectiveRuntimeSettingEventRecord[]
  }

  return {
    getRuntimeSettings,
    updateRuntimeSettings,
    listRuntimeSettingEvents
  }
}
