import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppPaths } from '../../../src/main/services/appPaths'

const {
  handlerMap,
  showOpenDialog,
  shellOpenPath,
  shellOpenExternal,
  openDatabase,
  runMigrations,
  listApprovedDraftSendDestinations,
  listApprovedPersonaDraftHandoffs,
  exportApprovedPersonaDraftToDirectory,
  listApprovedPersonaDraftPublications,
  publishApprovedPersonaDraftToDirectory,
  getApprovedDraftHostedShareHostStatus,
  listApprovedPersonaDraftHostedShareLinks,
  createApprovedPersonaDraftHostedShareLink,
  revokeApprovedPersonaDraftHostedShareLink,
  askMemoryWorkspacePersistedService,
  listApprovedPersonaDraftProviderSends,
  retryApprovedPersonaDraftProviderSend,
  sendApprovedPersonaDraftToProvider,
  getPersonAgentByCanonicalPersonId,
  listPersonAgentAuditEvents,
  listPersonAgentRefreshQueue,
  getPersonAgentFactMemorySummary,
  listPersonAgentInteractionMemories
} = vi.hoisted(() => ({
  handlerMap: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>(),
  showOpenDialog: vi.fn(),
  shellOpenPath: vi.fn(),
  shellOpenExternal: vi.fn(),
  openDatabase: vi.fn(),
  runMigrations: vi.fn(),
  listApprovedDraftSendDestinations: vi.fn(),
  listApprovedPersonaDraftHandoffs: vi.fn(),
  exportApprovedPersonaDraftToDirectory: vi.fn(),
  listApprovedPersonaDraftPublications: vi.fn(),
  publishApprovedPersonaDraftToDirectory: vi.fn(),
  getApprovedDraftHostedShareHostStatus: vi.fn(),
  listApprovedPersonaDraftHostedShareLinks: vi.fn(),
  createApprovedPersonaDraftHostedShareLink: vi.fn(),
  revokeApprovedPersonaDraftHostedShareLink: vi.fn(),
  askMemoryWorkspacePersistedService: vi.fn(),
  listApprovedPersonaDraftProviderSends: vi.fn(),
  retryApprovedPersonaDraftProviderSend: vi.fn(),
  sendApprovedPersonaDraftToProvider: vi.fn(),
  getPersonAgentByCanonicalPersonId: vi.fn(),
  listPersonAgentAuditEvents: vi.fn(),
  listPersonAgentRefreshQueue: vi.fn(),
  getPersonAgentFactMemorySummary: vi.fn(),
  listPersonAgentInteractionMemories: vi.fn()
}))

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog
  },
  shell: {
    openPath: shellOpenPath,
    openExternal: shellOpenExternal
  },
  ipcMain: {
    removeHandler: vi.fn((channel: string) => {
      handlerMap.delete(channel)
    }),
    handle: vi.fn((channel: string, handler: (event: unknown, payload?: unknown) => Promise<unknown>) => {
      handlerMap.set(channel, handler)
    })
  }
}))

vi.mock('../../../src/main/services/db', () => ({
  openDatabase,
  runMigrations
}))

vi.mock('../../../src/main/services/personaDraftHandoffService', () => ({
  listApprovedPersonaDraftHandoffs,
  exportApprovedPersonaDraftToDirectory
}))

vi.mock('../../../src/main/services/approvedDraftPublicationService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/main/services/approvedDraftPublicationService')>()
  return {
    ...actual,
    listApprovedPersonaDraftPublications,
    publishApprovedPersonaDraftToDirectory
  }
})

vi.mock('../../../src/main/services/approvedDraftHostedShareLinkService', () => ({
  getApprovedDraftHostedShareHostStatus,
  listApprovedPersonaDraftHostedShareLinks,
  createApprovedPersonaDraftHostedShareLink,
  revokeApprovedPersonaDraftHostedShareLink
}))

vi.mock('../../../src/main/services/approvedDraftSendDestinationService', () => ({
  listApprovedDraftSendDestinations
}))

vi.mock('../../../src/main/services/memoryWorkspaceSessionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/main/services/memoryWorkspaceSessionService')>()
  return {
    ...actual,
    askMemoryWorkspacePersisted: askMemoryWorkspacePersistedService
  }
})

vi.mock('../../../src/main/services/approvedDraftProviderSendService', () => ({
  listApprovedPersonaDraftProviderSends,
  retryApprovedPersonaDraftProviderSend,
  sendApprovedPersonaDraftToProvider
}))

vi.mock('../../../src/main/services/governancePersistenceService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/main/services/governancePersistenceService')>()
  return {
    ...actual,
    getPersonAgentByCanonicalPersonId,
    listPersonAgentAuditEvents,
    listPersonAgentRefreshQueue,
    listPersonAgentInteractionMemories
  }
})

vi.mock('../../../src/main/services/personAgentFactMemoryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/main/services/personAgentFactMemoryService')>()
  return {
    ...actual,
    getPersonAgentFactMemorySummary
  }
})

import { registerWorkspaceIpc } from '../../../src/main/modules/workspace/registerWorkspaceIpc'

function appPathsFixture(): AppPaths {
  return {
    root: '/tmp/forgetme',
    sqliteDir: '/tmp/forgetme/sqlite',
    vaultDir: '/tmp/forgetme/vault',
    vaultOriginalsDir: '/tmp/forgetme/vault/originals',
    importReportsDir: '/tmp/forgetme/reports',
    preservationReportsDir: '/tmp/forgetme/preservation-reports'
  }
}

function writeApprovedDraftPublicationPackage(
  packageRoot: string,
  options?: {
    includeManifest?: boolean
    includePublication?: boolean
    manifestPayload?: Record<string, unknown> | string
  }
) {
  fs.mkdirSync(packageRoot, { recursive: true })
  fs.writeFileSync(path.join(packageRoot, 'index.html'), '<html><body>share page</body></html>', 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'styles.css'), 'body { color: black; }', 'utf8')

  if (options?.includePublication !== false) {
    fs.writeFileSync(path.join(packageRoot, 'publication.json'), '{"publicationId":"publication-1"}', 'utf8')
  }

  if (options?.includeManifest !== false) {
    const manifestPayload = options?.manifestPayload ?? {
      formatVersion: 'phase10k1',
      sourceArtifact: 'approved_persona_draft_handoff',
      publicArtifactFileName: 'publication.json',
      displayEntryFileName: 'index.html',
      displayStylesFileName: 'styles.css'
    }
    fs.writeFileSync(
      path.join(packageRoot, 'manifest.json'),
      typeof manifestPayload === 'string' ? manifestPayload : JSON.stringify(manifestPayload),
      'utf8'
    )
  }
}

describe('registerWorkspaceIpc session handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    openDatabase.mockReset()
    runMigrations.mockReset()
    askMemoryWorkspacePersistedService.mockReset()
    getPersonAgentByCanonicalPersonId.mockReset()
    listPersonAgentAuditEvents.mockReset()
    listPersonAgentRefreshQueue.mockReset()
    getPersonAgentFactMemorySummary.mockReset()
    listPersonAgentInteractionMemories.mockReset()
  })

  it('passes persisted session asks through ipc and preserves conversation context cards', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    askMemoryWorkspacePersistedService.mockReturnValue({
      turnId: 'turn-2',
      sessionId: 'session-1',
      ordinal: 2,
      question: '那为什么这个冲突最值得先处理？',
      provider: null,
      model: null,
      contextHash: 'context-hash-2',
      promptHash: 'prompt-hash-2',
      createdAt: '2026-03-20T06:00:00.000Z',
      response: {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        question: '那为什么这个冲突最值得先处理？',
        expressionMode: 'advice',
        workflowKind: 'default',
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'Based on the archive, the safest next step is to resolve the highest-pressure ambiguity first.',
          displayType: 'open_conflict',
          citations: []
        },
        contextCards: [
          {
            cardId: 'conversation-context',
            title: 'Conversation Context',
            body: 'Previous question: 她现在有哪些还没解决的冲突？ Previous answer: Based on the archive, unresolved conflicts remain.',
            displayType: 'derived_summary',
            citations: []
          }
        ],
        guardrail: {
          decision: 'grounded_answer',
          reasonCodes: ['multi_source_synthesis'],
          citationCount: 1,
          sourceKinds: ['review'],
          fallbackApplied: false
        },
        boundaryRedirect: null,
        communicationEvidence: null,
        personaDraft: null
      }
    })

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:askMemoryWorkspacePersisted')
    const result = await handler?.({}, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '那为什么这个冲突最值得先处理？',
      expressionMode: 'advice',
      sessionId: 'session-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(askMemoryWorkspacePersistedService).toHaveBeenCalledWith(expect.anything(), {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '那为什么这个冲突最值得先处理？',
      expressionMode: 'advice',
      sessionId: 'session-1'
    })
    expect(result).toEqual(expect.objectContaining({
      sessionId: 'session-1',
      ordinal: 2
    }))
    expect((result as { response: { contextCards: Array<{ title: string }> } }).response.contextCards[0]?.title).toBe('Conversation Context')
    expect(close).toHaveBeenCalled()
  })
})

describe('registerWorkspaceIpc person-agent inspection handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    openDatabase.mockReset()
    runMigrations.mockReset()
    getPersonAgentByCanonicalPersonId.mockReset()
    listPersonAgentAuditEvents.mockReset()
    listPersonAgentRefreshQueue.mockReset()
    getPersonAgentFactMemorySummary.mockReset()
    listPersonAgentInteractionMemories.mockReset()
  })

  it('returns bounded person-agent state through ipc', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    getPersonAgentByCanonicalPersonId.mockReturnValue({
      personAgentId: 'agent-1',
      canonicalPersonId: 'cp-1',
      status: 'active',
      promotionTier: 'high_signal',
      promotionScore: 74,
      promotionReasonSummary: 'High signal person.',
      factsVersion: 2,
      interactionVersion: 3,
      lastRefreshedAt: '2026-03-13T00:00:00.000Z',
      lastActivatedAt: '2026-03-13T00:00:00.000Z',
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z'
    })

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:getPersonAgentState')
    const result = await handler?.({}, { canonicalPersonId: 'cp-1' })

    expect(getPersonAgentByCanonicalPersonId).toHaveBeenCalledWith(expect.anything(), {
      canonicalPersonId: 'cp-1'
    })
    expect(result).toEqual(expect.objectContaining({
      canonicalPersonId: 'cp-1',
      personAgentId: 'agent-1',
      status: 'active'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('returns refresh queue rows through ipc', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    listPersonAgentRefreshQueue.mockReturnValue([
      {
        refreshId: 'refresh-1',
        canonicalPersonId: 'cp-1',
        personAgentId: 'agent-1',
        status: 'pending',
        reasons: ['profile_projection_updated'],
        requestedAt: '2026-03-13T00:00:00.000Z',
        startedAt: null,
        completedAt: null,
        lastError: null,
        createdAt: '2026-03-13T00:00:00.000Z',
        updatedAt: '2026-03-13T00:00:00.000Z'
      }
    ])

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:listPersonAgentRefreshQueue')
    const result = await handler?.({}, { status: 'pending' })

    expect(listPersonAgentRefreshQueue).toHaveBeenCalledWith(expect.anything(), {
      status: 'pending'
    })
    expect(result).toEqual([
      expect.objectContaining({
        refreshId: 'refresh-1',
        status: 'pending'
      })
    ])
    expect(close).toHaveBeenCalled()
  })

  it('returns a bounded person-agent memory summary through ipc', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    getPersonAgentFactMemorySummary.mockReturnValue({
      personAgentId: 'agent-1',
      canonicalPersonId: 'cp-1',
      factsVersion: 2,
      counts: {
        facts: 1,
        timeline: 0,
        relationships: 0,
        conflicts: 0,
        coverageGaps: 1
      },
      facts: [
        {
          memoryId: 'fm-1',
          personAgentId: 'agent-1',
          canonicalPersonId: 'cp-1',
          memoryKey: 'identity.birthday',
          sectionKey: 'identity',
          displayLabel: 'Birthday',
          summaryValue: '1997-02-03',
          memoryKind: 'fact',
          confidence: 1,
          conflictState: 'none',
          freshnessAt: '2026-03-13T00:00:00.000Z',
          sourceRefs: [],
          sourceHash: 'hash-1',
          createdAt: '2026-03-13T00:00:00.000Z',
          updatedAt: '2026-03-13T00:00:00.000Z'
        }
      ],
      timeline: [],
      relationships: [],
      conflicts: [],
      coverageGaps: [
        {
          memoryId: 'fm-2',
          personAgentId: 'agent-1',
          canonicalPersonId: 'cp-1',
          memoryKey: 'coverage.work.empty',
          sectionKey: 'coverage',
          displayLabel: 'Work coverage gap',
          summaryValue: 'No approved work facts yet.',
          memoryKind: 'coverage_gap',
          confidence: null,
          conflictState: 'none',
          freshnessAt: null,
          sourceRefs: [],
          sourceHash: 'hash-2',
          createdAt: '2026-03-13T00:00:00.000Z',
          updatedAt: '2026-03-13T00:00:00.000Z'
        }
      ]
    })
    listPersonAgentInteractionMemories.mockReturnValue([
      {
        memoryId: 'im-1',
        personAgentId: 'agent-1',
        canonicalPersonId: 'cp-1',
        memoryKey: 'topic.profile_facts',
        topicLabel: 'Profile facts',
        summary: 'Birthday asked 3 times.',
        questionCount: 3,
        citationCount: 1,
        outcomeKinds: ['answered'],
        supportingTurnIds: ['turn-1'],
        lastQuestionAt: '2026-03-13T00:00:00.000Z',
        lastCitationAt: '2026-03-13T00:00:00.000Z',
        createdAt: '2026-03-13T00:00:00.000Z',
        updatedAt: '2026-03-13T00:00:00.000Z'
      }
    ])

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:getPersonAgentMemorySummary')
    const result = await handler?.({}, { canonicalPersonId: 'cp-1' })

    expect(getPersonAgentFactMemorySummary).toHaveBeenCalledWith(expect.anything(), {
      canonicalPersonId: 'cp-1'
    })
    expect(listPersonAgentInteractionMemories).toHaveBeenCalledWith(expect.anything(), {
      canonicalPersonId: 'cp-1'
    })
    expect(result).toEqual(expect.objectContaining({
      canonicalPersonId: 'cp-1',
      factSummary: expect.objectContaining({
        factsVersion: 2
      }),
      interactionMemories: [
        expect.objectContaining({
          memoryKey: 'topic.profile_facts'
        })
      ]
    }))
    expect(close).toHaveBeenCalled()
  })

  it('returns person-agent audit events through ipc', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    listPersonAgentAuditEvents.mockReturnValue([
      {
        auditEventId: 'audit-1',
        personAgentId: 'agent-1',
        canonicalPersonId: 'cp-1',
        eventKind: 'strategy_profile_updated',
        payload: {
          source: 'refresh_rebuild',
          reasons: ['review_conflict_changed'],
          changedFields: ['conflictBehavior']
        },
        createdAt: '2026-04-08T00:00:00.000Z'
      }
    ])

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:listPersonAgentAuditEvents')
    const result = await handler?.({}, {
      canonicalPersonId: 'cp-1',
      eventKind: 'strategy_profile_updated'
    })

    expect(listPersonAgentAuditEvents).toHaveBeenCalledWith(expect.anything(), {
      canonicalPersonId: 'cp-1',
      eventKind: 'strategy_profile_updated'
    })
    expect(result).toEqual([
      expect.objectContaining({
        auditEventId: 'audit-1',
        eventKind: 'strategy_profile_updated',
        payload: expect.objectContaining({
          source: 'refresh_rebuild'
        })
      })
    ])
    expect(close).toHaveBeenCalled()
  })

  it('returns a bundled person-agent inspection payload through ipc', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    getPersonAgentByCanonicalPersonId.mockReturnValue({
      personAgentId: 'agent-1',
      canonicalPersonId: 'cp-1',
      status: 'active',
      promotionTier: 'high_signal',
      promotionScore: 81,
      promotionReasonSummary: 'High-signal person agent.',
      strategyProfile: {
        profileVersion: 2,
        responseStyle: 'contextual',
        evidencePreference: 'quote_first',
        conflictBehavior: 'conflict_forward'
      },
      factsVersion: 3,
      interactionVersion: 4,
      lastRefreshedAt: '2026-04-08T01:00:00.000Z',
      lastActivatedAt: '2026-04-08T00:30:00.000Z',
      createdAt: '2026-04-07T00:00:00.000Z',
      updatedAt: '2026-04-08T01:00:00.000Z'
    })
    getPersonAgentFactMemorySummary.mockReturnValue({
      personAgentId: 'agent-1',
      canonicalPersonId: 'cp-1',
      factsVersion: 3,
      counts: {
        facts: 1,
        timeline: 0,
        relationships: 0,
        conflicts: 1,
        coverageGaps: 0
      },
      facts: [],
      timeline: [],
      relationships: [],
      conflicts: [],
      coverageGaps: []
    })
    listPersonAgentInteractionMemories.mockReturnValue([
      {
        memoryId: 'im-1',
        personAgentId: 'agent-1',
        canonicalPersonId: 'cp-1',
        memoryKey: 'topic.profile_facts',
        topicLabel: 'Profile facts',
        summary: 'Birthday asked 3 times.',
        questionCount: 3,
        citationCount: 1,
        outcomeKinds: ['answered'],
        supportingTurnIds: ['turn-1'],
        lastQuestionAt: '2026-04-08T00:00:00.000Z',
        lastCitationAt: '2026-04-08T00:00:00.000Z',
        createdAt: '2026-04-08T00:00:00.000Z',
        updatedAt: '2026-04-08T00:00:00.000Z'
      }
    ])
    listPersonAgentRefreshQueue.mockReturnValue([
      {
        refreshId: 'refresh-1',
        canonicalPersonId: 'cp-1',
        personAgentId: 'agent-1',
        status: 'pending',
        reasons: ['review_conflict_changed'],
        requestedAt: '2026-04-08T01:10:00.000Z',
        startedAt: null,
        completedAt: null,
        lastError: null,
        createdAt: '2026-04-08T01:10:00.000Z',
        updatedAt: '2026-04-08T01:10:00.000Z'
      }
    ])
    listPersonAgentAuditEvents.mockReturnValue([
      {
        auditEventId: 'audit-1',
        personAgentId: 'agent-1',
        canonicalPersonId: 'cp-1',
        eventKind: 'strategy_profile_updated',
        payload: {
          source: 'refresh_rebuild',
          changedFields: ['conflictBehavior']
        },
        createdAt: '2026-04-08T01:00:00.000Z'
      }
    ])

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:getPersonAgentInspectionBundle')
    const result = await handler?.({}, { canonicalPersonId: 'cp-1' })

    expect(getPersonAgentByCanonicalPersonId).toHaveBeenCalledWith(expect.anything(), {
      canonicalPersonId: 'cp-1'
    })
    expect(getPersonAgentFactMemorySummary).toHaveBeenCalledWith(expect.anything(), {
      canonicalPersonId: 'cp-1'
    })
    expect(listPersonAgentInteractionMemories).toHaveBeenCalledWith(expect.anything(), {
      canonicalPersonId: 'cp-1'
    })
    expect(listPersonAgentRefreshQueue).toHaveBeenCalledWith(expect.anything(), {
      canonicalPersonId: 'cp-1'
    })
    expect(listPersonAgentAuditEvents).toHaveBeenCalledWith(expect.anything(), {
      canonicalPersonId: 'cp-1'
    })
    expect(result).toEqual(expect.objectContaining({
      canonicalPersonId: 'cp-1',
      overview: expect.objectContaining({
        hasActiveAgent: true,
        pendingRefreshCount: 1,
        openConflictCount: 1,
        coverageGapCount: 0,
        interactionTopicCount: 1,
        totalQuestionCount: 3,
        latestRefreshRequestedAt: '2026-04-08T01:10:00.000Z',
        latestStrategyChange: expect.objectContaining({
          createdAt: '2026-04-08T01:00:00.000Z',
          source: 'refresh_rebuild',
          changedFields: ['conflictBehavior']
        })
      }),
      highlights: [
        expect.objectContaining({
          kind: 'refresh_pending',
          createdAt: '2026-04-08T01:10:00.000Z',
          title: 'Pending refresh queued'
        }),
        expect.objectContaining({
          kind: 'strategy_change',
          createdAt: '2026-04-08T01:00:00.000Z',
          title: 'Strategy profile updated'
        }),
        expect.objectContaining({
          kind: 'interaction_hotspot',
          createdAt: '2026-04-08T00:00:00.000Z',
          title: 'Recurring interaction topic'
        })
      ],
      state: expect.objectContaining({
        personAgentId: 'agent-1',
        status: 'active'
      }),
      memorySummary: expect.objectContaining({
        interactionMemories: [
          expect.objectContaining({
            memoryKey: 'topic.profile_facts'
          })
        ]
      }),
      refreshQueue: [
        expect.objectContaining({
          refreshId: 'refresh-1'
        })
      ],
      auditEvents: [
        expect.objectContaining({
          auditEventId: 'audit-1'
        })
      ]
    }))
    expect(close).toHaveBeenCalled()
  })
})

describe('registerWorkspaceIpc approved handoff handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    showOpenDialog.mockReset()
    openDatabase.mockReset()
    runMigrations.mockReset()
    shellOpenPath.mockReset()
    shellOpenExternal.mockReset()
    listApprovedDraftSendDestinations.mockReset()
    listApprovedPersonaDraftHandoffs.mockReset()
    exportApprovedPersonaDraftToDirectory.mockReset()
    listApprovedPersonaDraftPublications.mockReset()
    publishApprovedPersonaDraftToDirectory.mockReset()
    getApprovedDraftHostedShareHostStatus.mockReset()
    listApprovedPersonaDraftHostedShareLinks.mockReset()
    createApprovedPersonaDraftHostedShareLink.mockReset()
    revokeApprovedPersonaDraftHostedShareLink.mockReset()
    askMemoryWorkspacePersistedService.mockReset()
    listApprovedPersonaDraftProviderSends.mockReset()
    retryApprovedPersonaDraftProviderSend.mockReset()
    sendApprovedPersonaDraftToProvider.mockReset()
    delete process.env.FORGETME_E2E_PERSONA_DRAFT_HANDOFF_DESTINATION_DIR
    delete process.env.FORGETME_E2E_APPROVED_DRAFT_PUBLICATION_DESTINATION_DIR
  })

  it('returns the e2e handoff destination override without opening a dialog', async () => {
    process.env.FORGETME_E2E_PERSONA_DRAFT_HANDOFF_DESTINATION_DIR = '/tmp/persona-draft-exports'

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:selectPersonaDraftHandoffDestination')

    expect(handler).toBeTypeOf('function')
    await expect(handler?.({}, undefined)).resolves.toBe('/tmp/persona-draft-exports')
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('lists approved draft handoffs through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    listApprovedPersonaDraftHandoffs.mockReturnValue([{
      journalId: 'journal-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      handoffKind: 'local_json_export',
      status: 'exported',
      filePath: '/tmp/persona-draft-exports/persona-draft-review-review-1-approved.json',
      fileName: 'persona-draft-review-review-1-approved.json',
      sha256: 'hash-1',
      exportedAt: '2026-03-16T03:00:00.000Z'
    }])

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:listApprovedPersonaDraftHandoffs')
    const result = await handler?.({}, {
      draftReviewId: 'review-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(listApprovedPersonaDraftHandoffs).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1'
    })
    expect(result).toEqual([expect.objectContaining({
      draftReviewId: 'review-1',
      handoffKind: 'local_json_export'
    })])
    expect(close).toHaveBeenCalled()
  })

  it('exports approved drafts through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    exportApprovedPersonaDraftToDirectory.mockReturnValue({
      status: 'exported',
      journalId: 'journal-1',
      draftReviewId: 'review-1',
      handoffKind: 'local_json_export',
      filePath: '/tmp/persona-draft-exports/persona-draft-review-review-1-approved.json',
      fileName: 'persona-draft-review-review-1-approved.json',
      sha256: 'hash-1',
      exportedAt: '2026-03-16T03:00:00.000Z'
    })

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:exportApprovedPersonaDraft')
    const result = await handler?.({}, {
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/persona-draft-exports'
    })

    expect(exportApprovedPersonaDraftToDirectory).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/persona-draft-exports'
    })
    expect(result).toEqual(expect.objectContaining({
      draftReviewId: 'review-1',
      fileName: 'persona-draft-review-review-1-approved.json'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('returns the e2e publication destination override without opening a dialog', async () => {
    process.env.FORGETME_E2E_APPROVED_DRAFT_PUBLICATION_DESTINATION_DIR = '/tmp/approved-draft-publications'

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:selectApprovedDraftPublicationDestination')

    expect(handler).toBeTypeOf('function')
    await expect(handler?.({}, undefined)).resolves.toBe('/tmp/approved-draft-publications')
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('validates and lists approved draft publications through the ipc handler', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    listApprovedPersonaDraftPublications.mockReturnValue([{
      journalId: 'journal-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      publicationKind: 'local_share_package',
      status: 'published',
      packageRoot: '/tmp/approved-draft-publication-publication-1',
      manifestPath: '/tmp/approved-draft-publication-publication-1/manifest.json',
      publicArtifactPath: '/tmp/approved-draft-publication-publication-1/publication.json',
      publicArtifactFileName: 'publication.json',
      publicArtifactSha256: 'hash-1',
      displayEntryPath: '/tmp/approved-draft-publication-publication-1/index.html',
      displayEntryFileName: 'index.html',
      publishedAt: '2026-03-16T09:00:00.000Z'
    }])

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:listApprovedPersonaDraftPublications')

    await expect(handler?.({}, {
      draftReviewId: ''
    })).rejects.toThrow()
    expect(listApprovedPersonaDraftPublications).not.toHaveBeenCalled()

    const result = await handler?.({}, {
      draftReviewId: 'review-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(listApprovedPersonaDraftPublications).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1'
    })
    expect(result).toEqual([expect.objectContaining({
      draftReviewId: 'review-1',
      publicationKind: 'local_share_package'
    })])
    expect(close).toHaveBeenCalled()
  })

  it('validates and publishes approved drafts through the ipc handler', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    publishApprovedPersonaDraftToDirectory.mockReturnValue({
      status: 'published',
      journalId: 'journal-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      publicationKind: 'local_share_package',
      packageRoot: '/tmp/approved-draft-publication-publication-1',
      manifestPath: '/tmp/approved-draft-publication-publication-1/manifest.json',
      publicArtifactPath: '/tmp/approved-draft-publication-publication-1/publication.json',
      publicArtifactFileName: 'publication.json',
      publicArtifactSha256: 'hash-1',
      displayEntryPath: '/tmp/approved-draft-publication-publication-1/index.html',
      displayEntryFileName: 'index.html',
      publishedAt: '2026-03-16T09:00:00.000Z'
    })

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:publishApprovedPersonaDraft')

    await expect(handler?.({}, {
      draftReviewId: 'review-1',
      destinationRoot: ''
    })).rejects.toThrow()
    expect(publishApprovedPersonaDraftToDirectory).not.toHaveBeenCalled()

    const result = await handler?.({}, {
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/approved-draft-publications'
    })

    expect(publishApprovedPersonaDraftToDirectory).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/approved-draft-publications'
    })
    expect(result).toEqual(expect.objectContaining({
      draftReviewId: 'review-1',
      publicArtifactFileName: 'publication.json'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('rejects invalid open publication entry payloads', async () => {
    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:openApprovedDraftPublicationEntry')

    await expect(handler?.({}, {
      entryPath: '/tmp/approved-draft-publication-publication-1/not-index.html'
    })).rejects.toThrow()
    expect(shellOpenPath).not.toHaveBeenCalled()
  })

  it('opens a normalized publication entry path when shell open succeeds', async () => {
    shellOpenPath.mockResolvedValue('')
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-'))
    const entryPath = path.join(packageRoot, 'index.html')
    writeApprovedDraftPublicationPackage(packageRoot)

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:openApprovedDraftPublicationEntry')
    const result = await handler?.({}, {
      entryPath: path.join(packageRoot, '.', 'index.html')
    })

    expect(shellOpenPath).toHaveBeenCalledWith(entryPath)
    expect(result).toEqual({
      status: 'opened',
      entryPath,
      errorMessage: null
    })
  })

  it('returns structured failed status when publication entry is missing', async () => {
    registerWorkspaceIpc(appPathsFixture())

    const missingEntryPath = path.join(
      os.tmpdir(),
      'forgetme-approved-draft-publication-missing',
      'index.html'
    )
    const handler = handlerMap.get('archive:openApprovedDraftPublicationEntry')
    const result = await handler?.({}, {
      entryPath: missingEntryPath
    })

    expect(shellOpenPath).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 'failed',
      entryPath: missingEntryPath,
      errorMessage: `Publication entry file not found: ${missingEntryPath}`
    })
  })

  it('returns structured failed status when publication package files are missing', async () => {
    registerWorkspaceIpc(appPathsFixture())

    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-'))
    const entryPath = path.join(packageRoot, 'index.html')
    writeApprovedDraftPublicationPackage(packageRoot, {
      includePublication: false
    })

    const handler = handlerMap.get('archive:openApprovedDraftPublicationEntry')
    const result = await handler?.({}, {
      entryPath
    })

    expect(shellOpenPath).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 'failed',
      entryPath,
      errorMessage: `Publication package file not found: ${path.join(packageRoot, 'publication.json')}`
    })
  })

  it('returns structured failed status when publication manifest is not a valid ForgetMe package', async () => {
    registerWorkspaceIpc(appPathsFixture())

    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-'))
    const entryPath = path.join(packageRoot, 'index.html')
    writeApprovedDraftPublicationPackage(packageRoot, {
      manifestPayload: {
        formatVersion: 'phase10k1',
        sourceArtifact: 'approved_persona_draft_handoff',
        publicArtifactFileName: 'publication.json',
        displayEntryFileName: 'wrong.html',
        displayStylesFileName: 'styles.css'
      }
    })

    const handler = handlerMap.get('archive:openApprovedDraftPublicationEntry')
    const result = await handler?.({}, {
      entryPath
    })

    expect(shellOpenPath).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 'failed',
      entryPath,
      errorMessage: `Publication package manifest is invalid: ${path.join(packageRoot, 'manifest.json')}`
    })
  })

  it('returns structured failed status when shell open returns an error string', async () => {
    shellOpenPath.mockResolvedValue('No application knows how to open this file.')
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-approved-draft-publication-'))
    const entryPath = path.join(packageRoot, 'index.html')
    writeApprovedDraftPublicationPackage(packageRoot)

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:openApprovedDraftPublicationEntry')
    const result = await handler?.({}, {
      entryPath
    })

    expect(shellOpenPath).toHaveBeenCalledWith(entryPath)
    expect(result).toEqual({
      status: 'failed',
      entryPath,
      errorMessage: 'No application knows how to open this file.'
    })
  })

  it('returns hosted share host status through the ipc handler', async () => {
    getApprovedDraftHostedShareHostStatus.mockReturnValue({
      availability: 'configured',
      hostKind: 'configured_remote_host',
      hostLabel: 'https://share.example.test'
    })

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:getApprovedDraftHostedShareHostStatus')
    const result = await handler?.({}, undefined)

    expect(getApprovedDraftHostedShareHostStatus).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      availability: 'configured',
      hostKind: 'configured_remote_host',
      hostLabel: 'https://share.example.test'
    })
  })

  it('lists hosted share links through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    listApprovedPersonaDraftHostedShareLinks.mockReturnValue([{
      shareLinkId: 'share-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      hostKind: 'configured_remote_host',
      hostLabel: 'https://share.example.test',
      remoteShareId: 'remote-1',
      shareUrl: 'https://share.example.test/s/abc123',
      publicArtifactSha256: 'hash-1',
      status: 'active',
      createdAt: '2026-03-19T09:00:00.000Z',
      revokedAt: null
    }])

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:listApprovedPersonaDraftHostedShareLinks')

    await expect(handler?.({}, {
      draftReviewId: ''
    })).rejects.toThrow()
    expect(listApprovedPersonaDraftHostedShareLinks).not.toHaveBeenCalled()

    const result = await handler?.({}, {
      draftReviewId: 'review-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(listApprovedPersonaDraftHostedShareLinks).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1'
    })
    expect(result).toEqual([
      expect.objectContaining({
        shareLinkId: 'share-1',
        status: 'active'
      })
    ])
    expect(close).toHaveBeenCalled()
  })

  it('creates hosted share links through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    createApprovedPersonaDraftHostedShareLink.mockResolvedValue({
      shareLinkId: 'share-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      hostKind: 'configured_remote_host',
      hostLabel: 'https://share.example.test',
      remoteShareId: 'remote-1',
      shareUrl: 'https://share.example.test/s/abc123',
      publicArtifactSha256: 'hash-1',
      status: 'active',
      createdAt: '2026-03-19T09:00:00.000Z',
      revokedAt: null
    })

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:createApprovedPersonaDraftHostedShareLink')

    await expect(handler?.({}, {
      draftReviewId: ''
    })).rejects.toThrow()
    expect(createApprovedPersonaDraftHostedShareLink).not.toHaveBeenCalled()

    const result = await handler?.({}, {
      draftReviewId: 'review-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(createApprovedPersonaDraftHostedShareLink).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1'
    })
    expect(result).toEqual(expect.objectContaining({
      shareLinkId: 'share-1',
      status: 'active'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('revokes hosted share links through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    revokeApprovedPersonaDraftHostedShareLink.mockResolvedValue({
      shareLinkId: 'share-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      hostKind: 'configured_remote_host',
      hostLabel: 'https://share.example.test',
      remoteShareId: 'remote-1',
      shareUrl: 'https://share.example.test/s/abc123',
      publicArtifactSha256: 'hash-1',
      status: 'revoked',
      createdAt: '2026-03-19T09:00:00.000Z',
      revokedAt: '2026-03-19T09:05:00.000Z'
    })

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:revokeApprovedPersonaDraftHostedShareLink')

    await expect(handler?.({}, {
      shareLinkId: ''
    })).rejects.toThrow()
    expect(revokeApprovedPersonaDraftHostedShareLink).not.toHaveBeenCalled()

    const result = await handler?.({}, {
      shareLinkId: 'share-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(revokeApprovedPersonaDraftHostedShareLink).toHaveBeenCalledWith(expect.anything(), {
      shareLinkId: 'share-1'
    })
    expect(result).toEqual(expect.objectContaining({
      shareLinkId: 'share-1',
      status: 'revoked'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('opens hosted share links externally with a structured success result', async () => {
    shellOpenExternal.mockResolvedValue(undefined)

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:openApprovedDraftHostedShareLink')
    const result = await handler?.({}, {
      shareUrl: 'https://share.example.test/s/abc123'
    })

    expect(shellOpenExternal).toHaveBeenCalledWith('https://share.example.test/s/abc123')
    expect(result).toEqual({
      status: 'opened',
      shareUrl: 'https://share.example.test/s/abc123',
      errorMessage: null
    })
  })

  it('rejects invalid hosted share urls before shell.openExternal', async () => {
    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:openApprovedDraftHostedShareLink')

    await expect(handler?.({}, {
      shareUrl: 'ftp://share.example.test/s/abc123'
    })).rejects.toThrow()
    expect(shellOpenExternal).not.toHaveBeenCalled()
  })

  it('returns structured failed status when shell.openExternal throws', async () => {
    shellOpenExternal.mockRejectedValue(new Error('host unavailable'))

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:openApprovedDraftHostedShareLink')
    const result = await handler?.({}, {
      shareUrl: 'https://share.example.test/s/abc123'
    })

    expect(shellOpenExternal).toHaveBeenCalledWith('https://share.example.test/s/abc123')
    expect(result).toEqual({
      status: 'failed',
      shareUrl: 'https://share.example.test/s/abc123',
      errorMessage: 'host unavailable'
    })
  })

  it('lists approved draft provider sends through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    listApprovedPersonaDraftProviderSends.mockReturnValue([{
      artifactId: 'pdpe-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-72B-Instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-1',
      destinationId: 'memory-dialogue-default',
      destinationLabel: 'Memory Dialogue Default',
      attemptKind: 'initial_send',
      retryOfArtifactId: null,
      redactionSummary: {
        requestShape: 'approved_persona_draft_handoff_artifact',
        sourceArtifact: 'approved_persona_draft_handoff',
        removedFields: []
      },
      createdAt: '2026-03-16T08:00:00.000Z',
      events: []
    }])

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:listApprovedPersonaDraftProviderSends')
    const result = await handler?.({}, {
      draftReviewId: 'review-1'
    })

    expect(openDatabase).toHaveBeenCalledWith('/tmp/forgetme/sqlite/archive.sqlite')
    expect(runMigrations).toHaveBeenCalled()
    expect(listApprovedPersonaDraftProviderSends).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1'
    })
    expect(result).toEqual([expect.objectContaining({
      draftReviewId: 'review-1',
      policyKey: 'persona_draft.remote_send_approved'
    })])
    expect(close).toHaveBeenCalled()
  })

  it('sends approved drafts through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    sendApprovedPersonaDraftToProvider.mockResolvedValue({
      status: 'responded',
      artifactId: 'pdpe-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-72B-Instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-1',
      destinationId: 'memory-dialogue-default',
      destinationLabel: 'Memory Dialogue Default',
      attemptKind: 'initial_send',
      retryOfArtifactId: null,
      createdAt: '2026-03-16T08:00:00.000Z'
    })

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:sendApprovedPersonaDraftToProvider')
    const result = await handler?.({}, {
      draftReviewId: 'review-1',
      destinationId: 'memory-dialogue-default'
    })

    expect(sendApprovedPersonaDraftToProvider).toHaveBeenCalledWith(expect.anything(), {
      draftReviewId: 'review-1',
      destinationId: 'memory-dialogue-default'
    })
    expect(result).toEqual(expect.objectContaining({
      draftReviewId: 'review-1',
      policyKey: 'persona_draft.remote_send_approved'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('retries approved draft provider sends through the ipc handler and closes the database', async () => {
    const close = vi.fn()
    openDatabase.mockReturnValue({ close })
    retryApprovedPersonaDraftProviderSend.mockResolvedValue({
      status: 'responded',
      artifactId: 'pdpe-2',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      policyKey: 'persona_draft.remote_send_approved',
      requestHash: 'hash-2',
      destinationId: 'openrouter-qwen25-72b',
      destinationLabel: 'OpenRouter / qwen-2.5-72b-instruct',
      attemptKind: 'manual_retry',
      retryOfArtifactId: 'pdpe-failed-1',
      createdAt: '2026-03-16T08:05:00.000Z'
    })

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:retryApprovedPersonaDraftProviderSend')
    const result = await handler?.({}, {
      artifactId: 'pdpe-failed-1'
    })

    expect(retryApprovedPersonaDraftProviderSend).toHaveBeenCalledWith(expect.anything(), {
      artifactId: 'pdpe-failed-1'
    })
    expect(result).toEqual(expect.objectContaining({
      attemptKind: 'manual_retry',
      retryOfArtifactId: 'pdpe-failed-1'
    }))
    expect(close).toHaveBeenCalled()
  })

  it('lists built-in approved draft send destinations through the ipc handler', async () => {
    listApprovedDraftSendDestinations.mockReturnValue([
      {
        destinationId: 'memory-dialogue-default',
        label: 'Memory Dialogue Default',
        resolutionMode: 'memory_dialogue_default',
        provider: 'siliconflow',
        model: 'Qwen/Qwen2.5-72B-Instruct',
        isDefault: true
      }
    ])

    registerWorkspaceIpc(appPathsFixture())

    const handler = handlerMap.get('archive:listApprovedDraftSendDestinations')

    await expect(handler?.({}, undefined)).resolves.toEqual([
      expect.objectContaining({
        destinationId: 'memory-dialogue-default',
        isDefault: true
      })
    ])
    expect(listApprovedDraftSendDestinations).toHaveBeenCalledTimes(1)
  })
})
