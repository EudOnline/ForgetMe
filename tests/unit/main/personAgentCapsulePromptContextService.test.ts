import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureAppPaths } from '../../../src/main/services/appPaths'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  getPersonAgentCapsule,
  upsertPersonAgent,
  upsertPersonAgentRuntimeState
} from '../../../src/main/services/governancePersistenceService'
import { materializePersonAgentCapsule } from '../../../src/main/services/personAgentCapsuleService'
import {
  appendPersonAgentCapsuleActivityEvent,
  syncPersonAgentCapsuleRuntimeArtifacts
} from '../../../src/main/services/personAgentCapsuleRuntimeArtifactsService'
import { buildPersonAgentCapsulePromptContext } from '../../../src/main/services/personAgentCapsulePromptContextService'

const NOW = '2026-04-09T12:00:00.000Z'

describe('personAgentCapsulePromptContextService', () => {
  it('builds a bounded runtime context from capsule artifacts and recent activity', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-prompt-context-'))
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
      NOW,
      NOW
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
      interactionVersion: 5,
      lastActivatedAt: NOW
    })

    materializePersonAgentCapsule(db, {
      appPaths,
      personAgent,
      activationSource: 'import_batch',
      checkpointKind: 'activation',
      summary: 'Initial activation checkpoint.',
      now: NOW
    })

    upsertPersonAgentRuntimeState(db, {
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      sessionCount: 1,
      totalTurnCount: 3,
      latestQuestion: '她最近还记得哪些重要日期？',
      latestQuestionClassification: 'profile_fact',
      lastAnswerDigest: 'Need more stable evidence.',
      lastConsultedAt: NOW,
      updatedAt: NOW
    })

    const capsule = getPersonAgentCapsule(db, {
      personAgentId: personAgent.personAgentId
    })
    expect(capsule).not.toBeNull()

    syncPersonAgentCapsuleRuntimeArtifacts(db, {
      capsule: capsule!,
      personAgent,
      now: NOW
    })
    appendPersonAgentCapsuleActivityEvent({
      capsule: capsule!,
      event: {
        eventKind: 'consultation_turn_persisted',
        capsuleId: capsule!.capsuleId,
        personAgentId: personAgent.personAgentId,
        canonicalPersonId: 'cp-1',
        sessionId: 'session-1',
        turnId: 'turn-1',
        question: '她最近还记得哪些重要日期？',
        createdAt: NOW
      }
    })

    const context = buildPersonAgentCapsulePromptContext(db, {
      canonicalPersonId: 'cp-1'
    })

    expect(context).toMatchObject({
      capsuleId: capsule!.capsuleId,
      personAgentId: personAgent.personAgentId,
      canonicalPersonId: 'cp-1',
      sessionNamespace: `person-agent:${personAgent.personAgentId}`,
      identitySummary: expect.stringContaining('Alice Chen'),
      memorySummary: expect.stringContaining('Facts v3'),
      runtimeSummary: expect.stringContaining('她最近还记得哪些重要日期？'),
      latestCheckpointSummary: expect.stringContaining('Initial activation checkpoint')
    })
    expect(context?.recentActivity).toEqual([
      expect.objectContaining({
        eventKind: 'consultation_turn_persisted',
        summary: expect.stringContaining('她最近还记得哪些重要日期？')
      }),
      expect.objectContaining({
        eventKind: 'capsule_checkpoint_written',
        summary: expect.stringContaining('activation')
      })
    ])

    db.close()
  })
})
