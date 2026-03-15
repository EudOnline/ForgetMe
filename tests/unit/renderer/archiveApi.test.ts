import { afterEach, describe, expect, it, vi } from 'vitest'
import { getArchiveApi } from '../../../src/renderer/archiveApi'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('archiveApi workbench methods', () => {
  it('exposes review workbench read methods in the fallback API', async () => {
    vi.stubGlobal('window', {})

    const archiveApi = getArchiveApi()

    await expect(archiveApi.listReviewWorkbenchItems({ itemType: 'structured_field_candidate' })).resolves.toEqual([])
    await expect(archiveApi.getReviewWorkbenchItem('rq-1')).resolves.toBeNull()
    await expect(archiveApi.listDecisionJournal({ query: 'Alice Chen' })).resolves.toEqual([])
    await expect(archiveApi.searchDecisionJournal({ query: 'Alice Chen' })).resolves.toEqual([])
    await expect(archiveApi.approveSafeReviewGroup({ groupKey: 'cp-1::profile_attribute_candidate::school_name' })).resolves.toEqual({
      status: 'approved',
      batchId: '',
      journalId: '',
      groupKey: 'cp-1::profile_attribute_candidate::school_name',
      itemCount: 0,
      canonicalPersonId: null,
      canonicalPersonName: null,
      itemType: 'profile_attribute_candidate',
      fieldKey: null,
      queueItemIds: []
    })
  })
})

describe('archiveApi preservation methods', () => {
  it('exposes export and restore methods in the fallback API', async () => {
    vi.stubGlobal('window', {})

    const archiveApi = getArchiveApi()

    await expect(archiveApi.createBackupExport({
      destinationRoot: '/tmp/export-root',
      encryptionPassword: 'correct horse battery staple'
    })).resolves.toEqual(null)
    await expect(archiveApi.restoreBackupExport({
      exportRoot: '/tmp/export-1',
      targetRoot: '/tmp/restore-root',
      encryptionPassword: 'correct horse battery staple'
    })).resolves.toEqual(null)
    await expect(archiveApi.runRecoveryDrill({
      exportRoot: '/tmp/export-1',
      targetRoot: '/tmp/restore-root'
    })).resolves.toEqual(null)
  })
})

describe('archiveApi dossier methods', () => {
  it('exposes person dossier reads in the fallback API', async () => {
    vi.stubGlobal('window', {})

    const archiveApi = getArchiveApi()

    await expect(archiveApi.listGroupPortraits()).resolves.toEqual([])
    await expect(archiveApi.getPersonDossier('cp-1')).resolves.toBeNull()
    await expect(archiveApi.askMemoryWorkspace({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
      expressionMode: 'advice'
    })).resolves.toBeNull()
    await expect(archiveApi.listMemoryWorkspaceSessions()).resolves.toEqual([])
    await expect(archiveApi.getMemoryWorkspaceSession('session-1')).resolves.toBeNull()
    await expect(archiveApi.askMemoryWorkspacePersisted({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
      expressionMode: 'advice'
    })).resolves.toBeNull()
    await expect(archiveApi.runMemoryWorkspaceCompare({
      scope: { kind: 'global' },
      question: '现在最值得关注什么？',
      expressionMode: 'advice'
    })).resolves.toBeNull()
    await expect(archiveApi.runMemoryWorkspaceCompareMatrix({
      expressionMode: 'advice',
      rows: [{
        scope: { kind: 'global' },
        question: '现在最值得关注什么？'
      }]
    })).resolves.toBeNull()
    await expect(archiveApi.listMemoryWorkspaceCompareSessions()).resolves.toEqual([])
    await expect(archiveApi.getMemoryWorkspaceCompareSession('compare-session-1')).resolves.toBeNull()
    await expect(archiveApi.listMemoryWorkspaceCompareMatrices()).resolves.toEqual([])
    await expect(archiveApi.getMemoryWorkspaceCompareMatrix('matrix-session-1')).resolves.toBeNull()
    await expect(archiveApi.getGroupPortrait('cp-1')).resolves.toBeNull()
    await expect(archiveApi.selectContextPackExportDestination()).resolves.toBeNull()
    await expect(archiveApi.getPersonContextPack({
      canonicalPersonId: 'cp-1',
      mode: 'approved_plus_derived'
    })).resolves.toBeNull()
    await expect(archiveApi.getGroupContextPack({
      anchorPersonId: 'cp-1'
    })).resolves.toBeNull()
    await expect(archiveApi.exportPersonContextPack({
      canonicalPersonId: 'cp-1',
      destinationRoot: '/tmp/context-packs'
    })).resolves.toBeNull()
    await expect(archiveApi.exportGroupContextPack({
      anchorPersonId: 'cp-1',
      destinationRoot: '/tmp/context-packs',
      mode: 'approved_only'
    })).resolves.toBeNull()
  })

  it('preserves richer memory workspace turn responses when a renderer API is present', async () => {
    const askMemoryWorkspacePersisted = vi.fn().mockResolvedValue({
      turnId: 'turn-1',
      sessionId: 'session-1',
      ordinal: 1,
      question: '如果她本人会怎么说？',
      provider: null,
      model: null,
      contextHash: 'context-1',
      promptHash: 'prompt-1',
      createdAt: '2026-03-15T00:00:00.000Z',
      response: {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        question: '如果她本人会怎么说？',
        expressionMode: 'grounded',
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'This memory workspace cannot answer as if it were the archived person.',
          displayType: 'coverage_gap',
          citations: []
        },
        contextCards: [],
        guardrail: {
          decision: 'fallback_unsupported_request',
          reasonCodes: ['persona_request'],
          citationCount: 0,
          sourceKinds: [],
          fallbackApplied: true
        },
        boundaryRedirect: {
          kind: 'persona_request',
          title: 'Persona request blocked',
          message: 'Use grounded archive questions instead of imitation.',
          reasons: ['persona_request', 'delegation_not_allowed'],
          suggestedAsks: [
            {
              label: 'Grounded summary',
              question: '先基于档案总结她当前最明确的状态。',
              expressionMode: 'grounded',
              rationale: 'Summarize the strongest approved archive signal first.'
            }
          ]
        }
      }
    })

    vi.stubGlobal('window', {
      archiveApi: {
        askMemoryWorkspacePersisted
      }
    })

    const archiveApi = getArchiveApi()
    const turn = await archiveApi.askMemoryWorkspacePersisted({
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '如果她本人会怎么说？'
    })

    expect(turn?.response.boundaryRedirect?.kind).toBe('persona_request')
    expect(turn?.response.boundaryRedirect?.suggestedAsks[0]?.label).toBe('Grounded summary')
  })
})
