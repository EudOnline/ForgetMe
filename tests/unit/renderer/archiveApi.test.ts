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
    await expect(archiveApi.getPersonaDraftReviewByTurn('turn-1')).resolves.toBeNull()
    await expect(archiveApi.createPersonaDraftReviewFromTurn('turn-1')).resolves.toBeNull()
    await expect(archiveApi.updatePersonaDraftReview({
      draftReviewId: 'review-1',
      editedDraft: '可审阅草稿：先整理归档，再继续补齐细节。'
    })).resolves.toBeNull()
    await expect(archiveApi.transitionPersonaDraftReview({
      draftReviewId: 'review-1',
      status: 'approved'
    })).resolves.toBeNull()
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
      ordinal: 2,
      question: '她过去是怎么表达记录和归档这类事的？给我看原话。',
      provider: null,
      model: null,
      contextHash: 'context-1',
      promptHash: 'prompt-1',
      createdAt: '2026-03-15T00:00:00.000Z',
      response: {
        scope: { kind: 'person', canonicalPersonId: 'cp-1' },
        question: '她过去是怎么表达记录和归档这类事的？给我看原话。',
        expressionMode: 'grounded',
        workflowKind: 'persona_draft_sandbox',
        title: 'Memory Workspace · Alice Chen',
        answer: {
          summary: 'Direct chat excerpts in the approved archive address the ask.',
          displayType: 'derived_summary',
          citations: []
        },
        contextCards: [],
        guardrail: {
          decision: 'grounded_answer',
          reasonCodes: ['multi_source_synthesis'],
          citationCount: 2,
          sourceKinds: ['file'],
          fallbackApplied: false
        },
        boundaryRedirect: null,
        communicationEvidence: {
          title: 'Communication Evidence',
          summary: 'Direct archive-backed excerpts related to this ask.',
          excerpts: [
            {
              excerptId: 'ce-1',
              fileId: 'f-1',
              fileName: 'chat-1.json',
              ordinal: 1,
              speakerDisplayName: 'Alice Chen',
              text: '我们还是把这些记录留在归档里，后面查起来更稳妥。'
            }
          ]
        },
        personaDraft: {
          title: 'Reviewed draft sandbox',
          disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
          draft: '可审阅草稿：先把关键记录整理进归档，把重要细节继续记下来，这样后面查找会更稳妥。',
          reviewState: 'review_required',
          supportingExcerpts: ['ce-1'],
          trace: [
            {
              traceId: 'trace-1',
              excerptIds: ['ce-1'],
              explanation: 'Draft segment 1 stays grounded in Alice Chen excerpt ce-1.'
            }
          ]
        }
      }
    })
    const getPersonaDraftReviewByTurn = vi.fn().mockResolvedValue({
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      workflowKind: 'persona_draft_sandbox',
      status: 'draft',
      baseDraft: '可审阅草稿：先把关键记录整理进归档。',
      editedDraft: '可审阅草稿：先把关键记录整理进归档，再补齐细节。',
      reviewNotes: 'Sharper and easier to reuse.',
      supportingExcerpts: ['ce-1'],
      trace: [
        {
          traceId: 'trace-1',
          excerptIds: ['ce-1'],
          explanation: 'Draft segment 1 stays grounded in Alice Chen excerpt ce-1.'
        }
      ],
      approvedJournalId: null,
      rejectedJournalId: null,
      createdAt: '2026-03-16T01:00:00.000Z',
      updatedAt: '2026-03-16T01:05:00.000Z'
    })

    vi.stubGlobal('window', {
      archiveApi: {
        askMemoryWorkspacePersisted,
        getPersonaDraftReviewByTurn
      }
    })

    const archiveApi = getArchiveApi()
    const turn = await archiveApi.askMemoryWorkspacePersisted({
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她过去是怎么表达记录和归档这类事的？给我看原话。'
    })

    expect(turn?.response.communicationEvidence?.title).toBe('Communication Evidence')
    expect(turn?.response.communicationEvidence?.excerpts[0]?.fileName).toBe('chat-1.json')
    expect(turn?.response.workflowKind).toBe('persona_draft_sandbox')
    expect(turn?.response.personaDraft?.reviewState).toBe('review_required')
    expect(turn?.response.boundaryRedirect).toBeNull()

    const review = await archiveApi.getPersonaDraftReviewByTurn('turn-1')
    expect(review?.draftReviewId).toBe('review-1')
    expect(review?.status).toBe('draft')
  })
})
