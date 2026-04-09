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
import { buildPersonAgentCapsulePromptBundle } from '../../../src/main/services/personAgentCapsulePromptBundleService'

const NOW = '2026-04-09T13:30:00.000Z'

describe('personAgentCapsulePromptBundleService', () => {
  it('renders a consultation prompt bundle from capsule runtime context', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-person-agent-prompt-bundle-'))
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
      promotionScore: 88,
      promotionReasonSummary: 'High-signal person ready for capsule execution.',
      strategyProfile: {
        profileVersion: 2,
        responseStyle: 'contextual',
        evidencePreference: 'quote_first',
        conflictBehavior: 'conflict_forward'
      },
      factsVersion: 3,
      interactionVersion: 6,
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
      totalTurnCount: 2,
      latestQuestion: '她的生日是什么？',
      latestQuestionClassification: 'profile_fact',
      lastAnswerDigest: 'Birthday: 1997-02-03.',
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
        question: '她的生日是什么？',
        createdAt: NOW
      }
    })

    const bundle = buildPersonAgentCapsulePromptBundle(db, {
      canonicalPersonId: 'cp-1',
      operationKind: 'consultation',
      promptInput: '她的生日是什么？'
    })

    expect(bundle).toMatchObject({
      bundleVersion: 1,
      operationKind: 'consultation',
      capsuleId: capsule!.capsuleId,
      canonicalPersonId: 'cp-1',
      personAgentId: personAgent.personAgentId,
      sessionNamespace: `person-agent:${personAgent.personAgentId}`,
      promptInput: '她的生日是什么？',
      systemPrompt: expect.stringContaining('Alice Chen'),
      userPrompt: expect.stringContaining('她的生日是什么？'),
      context: expect.objectContaining({
        identitySummary: expect.stringContaining('Alice Chen'),
        memorySummary: expect.stringContaining('Facts v3'),
        runtimeSummary: expect.stringContaining('她的生日是什么？')
      })
    })
    expect(bundle?.context.recentActivity).toEqual([
      expect.stringContaining('Consultation turn persisted'),
      expect.stringContaining('capsule checkpoint')
    ])

    db.close()
  })
})
