import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  getPersonAgentCapsule,
  listPersonAgentCapsuleMemoryCheckpoints,
  upsertPersonAgent
} from '../../../src/main/services/governancePersistenceService'
import { backfillPersonAgentCapsules } from '../../../src/main/services/personAgentCapsuleBackfillService'

describe('personAgentCapsuleService', () => {
  it('materializes a capsule with filesystem roots and an activation checkpoint', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-capsule-service-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(root, 'archive.sqlite'))
    runMigrations(db)

    db.prepare(
      `insert into canonical_people (
        id, primary_display_name, normalized_name, alias_count, evidence_count, manual_labels_json, status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'cp-1',
      'Alice Chen',
      'alice chen',
      1,
      4,
      '[]',
      'approved',
      '2026-04-09T01:00:00.000Z',
      '2026-04-09T01:00:00.000Z'
    )

    const personAgent = upsertPersonAgent(db, {
      canonicalPersonId: 'cp-1',
      status: 'active',
      promotionTier: 'high_signal',
      promotionScore: 81,
      promotionReasonSummary: 'Strong import and relationship signal.',
      strategyProfile: {
        profileVersion: 2,
        responseStyle: 'contextual',
        evidencePreference: 'quote_first',
        conflictBehavior: 'conflict_forward'
      },
      factsVersion: 3,
      interactionVersion: 4,
      lastActivatedAt: '2026-04-09T01:05:00.000Z'
    })

    const capsuleModule = await import('../../../src/main/services/personAgentCapsuleService')
    const materializeCapsule = Reflect.get(capsuleModule, 'materializePersonAgentCapsule') as
      | ((...args: unknown[]) => unknown)
      | undefined

    expect(typeof materializeCapsule).toBe('function')

    const capsule = materializeCapsule?.(db, {
      appPaths,
      personAgent,
      activationSource: 'import_batch',
      checkpointKind: 'activation',
      taskSnapshotAt: '2026-04-09T01:05:00.000Z',
      summary: 'Initial activation checkpoint.',
      summaryPayload: {
        source: 'import_batch'
      },
      now: '2026-04-09T01:05:00.000Z'
    })

    expect(capsule).toEqual(expect.objectContaining({
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      capsuleStatus: 'ready',
      activationSource: 'import_batch'
    }))
    expect(fs.existsSync(path.join(appPaths.personAgentWorkspaceDir, personAgent.personAgentId))).toBe(true)
    expect(fs.existsSync(path.join(appPaths.personAgentStateDir, personAgent.personAgentId))).toBe(true)
    expect(getPersonAgentCapsule(db, {
      personAgentId: personAgent.personAgentId
    })).toEqual(expect.objectContaining({
      capsuleStatus: 'ready',
      latestCheckpointId: expect.any(String)
    }))
    const checkpoints = listPersonAgentCapsuleMemoryCheckpoints(db, {
      personAgentId: personAgent.personAgentId
    })
    expect(checkpoints).toEqual([
      expect.objectContaining({
        checkpointKind: 'activation',
        factsVersion: 3,
        interactionVersion: 4,
        strategyProfileVersion: 2
      })
    ])
    const workspaceRoot = path.join(appPaths.personAgentWorkspaceDir, personAgent.personAgentId)
    const stateRoot = path.join(appPaths.personAgentStateDir, personAgent.personAgentId)
    const identityArtifactPath = path.join(workspaceRoot, 'identity.json')
    const memorySnapshotPath = path.join(workspaceRoot, 'memory-snapshot.json')
    const runtimeStatePath = path.join(stateRoot, 'runtime-state.json')
    const checkpointArtifactPath = path.join(stateRoot, 'checkpoints', `${checkpoints[0]!.checkpointId}.json`)

    expect(fs.existsSync(identityArtifactPath)).toBe(true)
    expect(fs.existsSync(memorySnapshotPath)).toBe(true)
    expect(fs.existsSync(runtimeStatePath)).toBe(true)
    expect(fs.existsSync(checkpointArtifactPath)).toBe(true)

    expect(JSON.parse(fs.readFileSync(identityArtifactPath, 'utf8'))).toEqual(expect.objectContaining({
      capsuleId: expect.any(String),
      canonicalPersonId: 'cp-1',
      personAgentId: personAgent.personAgentId,
      activationSource: 'import_batch'
    }))
    expect(JSON.parse(fs.readFileSync(memorySnapshotPath, 'utf8'))).toEqual(expect.objectContaining({
      canonicalPersonId: 'cp-1',
      personAgentId: personAgent.personAgentId,
      factsVersion: 3,
      interactionVersion: 4,
      strategyProfileVersion: 2
    }))
    expect(JSON.parse(fs.readFileSync(runtimeStatePath, 'utf8'))).toEqual(expect.objectContaining({
      canonicalPersonId: 'cp-1',
      personAgentId: personAgent.personAgentId,
      sessionNamespace: `person-agent:${personAgent.personAgentId}`
    }))
    expect(JSON.parse(fs.readFileSync(checkpointArtifactPath, 'utf8'))).toEqual(expect.objectContaining({
      checkpointId: checkpoints[0]!.checkpointId,
      checkpointKind: 'activation',
      canonicalPersonId: 'cp-1'
    }))

    db.close()
  })

  it('does not append a duplicate checkpoint when versions are unchanged', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-capsule-service-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(root, 'archive.sqlite'))
    runMigrations(db)

    db.prepare(
      `insert into canonical_people (
        id, primary_display_name, normalized_name, alias_count, evidence_count, manual_labels_json, status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'cp-1',
      'Alice Chen',
      'alice chen',
      1,
      4,
      '[]',
      'approved',
      '2026-04-09T01:00:00.000Z',
      '2026-04-09T01:00:00.000Z'
    )

    const personAgent = upsertPersonAgent(db, {
      canonicalPersonId: 'cp-1',
      status: 'active',
      promotionTier: 'high_signal',
      promotionScore: 81,
      promotionReasonSummary: 'Strong import and relationship signal.',
      strategyProfile: {
        profileVersion: 2,
        responseStyle: 'contextual',
        evidencePreference: 'quote_first',
        conflictBehavior: 'conflict_forward'
      },
      factsVersion: 3,
      interactionVersion: 4,
      lastActivatedAt: '2026-04-09T01:05:00.000Z'
    })

    const capsuleModule = await import('../../../src/main/services/personAgentCapsuleService')
    const materializeCapsule = Reflect.get(capsuleModule, 'materializePersonAgentCapsule') as
      | ((...args: unknown[]) => unknown)
      | undefined

    materializeCapsule?.(db, {
      appPaths,
      personAgent,
      activationSource: 'import_batch',
      checkpointKind: 'activation',
      summary: 'Initial activation checkpoint.',
      now: '2026-04-09T01:05:00.000Z'
    })
    materializeCapsule?.(db, {
      appPaths,
      personAgent,
      activationSource: 'refresh_rebuild',
      checkpointKind: 'refresh',
      summary: 'No-op refresh checkpoint.',
      now: '2026-04-09T01:06:00.000Z'
    })

    expect(listPersonAgentCapsuleMemoryCheckpoints(db, {
      personAgentId: personAgent.personAgentId
    })).toHaveLength(1)

    const refreshedAgent = upsertPersonAgent(db, {
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      status: 'active',
      promotionTier: 'high_signal',
      promotionScore: 84,
      promotionReasonSummary: 'Facts version increased after refresh.',
      strategyProfile: {
        profileVersion: 3,
        responseStyle: 'contextual',
        evidencePreference: 'quote_first',
        conflictBehavior: 'conflict_forward'
      },
      factsVersion: 4,
      interactionVersion: 4,
      lastActivatedAt: '2026-04-09T01:05:00.000Z'
    })

    materializeCapsule?.(db, {
      appPaths,
      personAgent: refreshedAgent,
      activationSource: 'refresh_rebuild',
      checkpointKind: 'refresh',
      summary: 'Refresh changed fact memory version.',
      now: '2026-04-09T01:07:00.000Z'
    })

    expect(listPersonAgentCapsuleMemoryCheckpoints(db, {
      personAgentId: personAgent.personAgentId
    })).toEqual([
      expect.objectContaining({
        checkpointKind: 'refresh',
        factsVersion: 4,
        strategyProfileVersion: 3
      }),
      expect.objectContaining({
        checkpointKind: 'activation',
        factsVersion: 3,
        strategyProfileVersion: 2
      })
    ])

    db.close()
  })

  it('backfills missing capsules for historical active person agents without duplication', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-capsule-backfill-'))
    const appPaths = ensureAppPaths(root)
    const db = openDatabase(path.join(root, 'archive.sqlite'))
    runMigrations(db)

    db.prepare(
      `insert into canonical_people (
        id, primary_display_name, normalized_name, alias_count, evidence_count, manual_labels_json, status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'cp-legacy',
      'Legacy Alice',
      'legacy alice',
      1,
      3,
      '[]',
      'approved',
      '2026-04-09T01:00:00.000Z',
      '2026-04-09T01:00:00.000Z'
    )

    const personAgent = upsertPersonAgent(db, {
      canonicalPersonId: 'cp-legacy',
      status: 'active',
      promotionTier: 'high_signal',
      promotionScore: 72,
      promotionReasonSummary: 'Historical promotion before capsule support.',
      strategyProfile: {
        profileVersion: 1,
        responseStyle: 'contextual',
        evidencePreference: 'quote_first',
        conflictBehavior: 'balanced'
      },
      factsVersion: 2,
      interactionVersion: 1,
      lastActivatedAt: '2026-04-09T01:05:00.000Z'
    })

    const firstPass = backfillPersonAgentCapsules(db, {
      appPaths,
      now: '2026-04-09T01:10:00.000Z'
    })

    expect(firstPass).toMatchObject({
      scannedCount: 1,
      repairedCount: 1,
      skippedCount: 0
    })
    expect(getPersonAgentCapsule(db, {
      personAgentId: personAgent.personAgentId
    })).toEqual(expect.objectContaining({
      capsuleStatus: 'ready',
      activationSource: 'manual_backfill'
    }))
    expect(listPersonAgentCapsuleMemoryCheckpoints(db, {
      personAgentId: personAgent.personAgentId
    })).toEqual([
      expect.objectContaining({
        checkpointKind: 'backfill',
        factsVersion: 2,
        interactionVersion: 1
      })
    ])

    const secondPass = backfillPersonAgentCapsules(db, {
      appPaths,
      now: '2026-04-09T01:11:00.000Z'
    })

    expect(secondPass).toMatchObject({
      scannedCount: 1,
      repairedCount: 0,
      skippedCount: 1
    })
    expect(listPersonAgentCapsuleMemoryCheckpoints(db, {
      personAgentId: personAgent.personAgentId
    })).toHaveLength(1)

    db.close()
  })
})
