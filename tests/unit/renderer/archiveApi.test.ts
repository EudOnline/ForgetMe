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

describe('archiveApi agent runtime methods', () => {
  it('exposes agent runtime methods in the fallback API', async () => {
    vi.stubGlobal('window', {})

    const archiveApi = getArchiveApi()

    await expect(archiveApi.runAgentTask({
      prompt: 'Summarize the highest-priority pending review work',
      role: 'orchestrator'
    })).resolves.toEqual({
      runId: '',
      status: 'queued',
      targetRole: null,
      assignedRoles: [],
      latestAssistantResponse: null
    })
    await expect(archiveApi.previewAgentTask({
      prompt: 'Approve review item rq-1',
      role: 'review',
      taskKind: 'review.apply_item_decision'
    })).resolves.toEqual({
      taskKind: 'review.apply_item_decision',
      targetRole: 'review',
      assignedRoles: ['review'],
      requiresConfirmation: true
    })
    await expect(archiveApi.listAgentRuns({
      role: 'review'
    })).resolves.toEqual([])
    await expect(archiveApi.getAgentRun({
      runId: 'run-1'
    })).resolves.toBeNull()
    await expect(archiveApi.listAgentMemories({
      role: 'governance'
    })).resolves.toEqual([])
    await expect(archiveApi.listAgentPolicyVersions({
      role: 'governance'
    })).resolves.toEqual([])
  })

  it('preserves renderer-provided agent runtime methods', async () => {
    const runAgentTask = vi.fn().mockResolvedValue({
      runId: 'run-1',
      status: 'completed',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      latestAssistantResponse: '1 pending items across 1 conflict groups.'
    })
    const previewAgentTask = vi.fn().mockResolvedValue({
      taskKind: 'review.apply_item_decision',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      requiresConfirmation: true
    })
    const listAgentRuns = vi.fn().mockResolvedValue([
      {
        runId: 'run-1',
        role: 'orchestrator',
        taskKind: 'review.summarize_queue',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        latestAssistantResponse: '1 pending items across 1 conflict groups.',
        status: 'completed',
        prompt: 'Summarize the highest-priority pending review work',
        confirmationToken: null,
        policyVersion: null,
        errorMessage: null,
        createdAt: '2026-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:00.000Z'
      }
    ])
    const getAgentRun = vi.fn().mockResolvedValue({
      runId: 'run-1',
      role: 'orchestrator',
      taskKind: 'review.summarize_queue',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      latestAssistantResponse: '1 pending items across 1 conflict groups.',
      status: 'completed',
      prompt: 'Summarize the highest-priority pending review work',
      confirmationToken: null,
      policyVersion: null,
      errorMessage: null,
      createdAt: '2026-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:00:00.000Z',
      messages: [
        {
          messageId: 'message-1',
          runId: 'run-1',
          ordinal: 1,
          sender: 'agent',
          content: '1 pending items across 1 conflict groups.',
          createdAt: '2026-03-29T00:00:00.000Z'
        }
      ]
    })
    const listAgentMemories = vi.fn().mockResolvedValue([
      {
        memoryId: 'memory-1',
        role: 'governance',
        memoryKey: 'governance.feedback',
        memoryValue: 'Prefer queue summaries first.',
        createdAt: '2026-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:00.000Z'
      }
    ])
    const listAgentPolicyVersions = vi.fn().mockResolvedValue([
      {
        policyVersionId: 'policy-1',
        role: 'governance',
        policyKey: 'governance.review.policy',
        policyBody: 'Prefer queue summaries first.',
        createdAt: '2026-03-29T00:00:01.000Z'
      }
    ])

    vi.stubGlobal('window', {
      archiveApi: {
        previewAgentTask,
        runAgentTask,
        listAgentRuns,
        getAgentRun,
        listAgentMemories,
        listAgentPolicyVersions
      }
    })

    const archiveApi = getArchiveApi()
    const preview = await archiveApi.previewAgentTask({
      prompt: 'Approve review item rq-1',
      role: 'orchestrator'
    })
    const run = await archiveApi.runAgentTask({
      prompt: 'Summarize the highest-priority pending review work',
      role: 'orchestrator'
    })
    const runs = await archiveApi.listAgentRuns({ role: 'review' })
    const detail = await archiveApi.getAgentRun({ runId: 'run-1' })
    const memories = await archiveApi.listAgentMemories({ role: 'governance' })
    const policyVersions = await archiveApi.listAgentPolicyVersions({ role: 'governance' })

    expect(preview).toEqual({
      taskKind: 'review.apply_item_decision',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      requiresConfirmation: true
    })
    expect(run).toEqual({
      runId: 'run-1',
      status: 'completed',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      latestAssistantResponse: '1 pending items across 1 conflict groups.'
    })
    expect(runs[0]?.runId).toBe('run-1')
    expect(runs[0]?.targetRole).toBe('review')
    expect(runs[0]?.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(runs[0]?.latestAssistantResponse).toBe('1 pending items across 1 conflict groups.')
    expect(detail?.targetRole).toBe('review')
    expect(detail?.assignedRoles).toEqual(['orchestrator', 'review'])
    expect(detail?.latestAssistantResponse).toBe('1 pending items across 1 conflict groups.')
    expect(detail?.messages[0]?.content).toContain('pending items')
    expect(memories[0]?.memoryKey).toBe('governance.feedback')
    expect(policyVersions[0]?.policyKey).toBe('governance.review.policy')
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
    await expect(archiveApi.selectPersonaDraftHandoffDestination()).resolves.toBeNull()
    await expect(archiveApi.listApprovedPersonaDraftHandoffs({
      draftReviewId: 'review-1'
    })).resolves.toEqual([])
    await expect(archiveApi.exportApprovedPersonaDraft({
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/persona-draft-exports'
    })).resolves.toBeNull()
    await expect(archiveApi.selectApprovedDraftPublicationDestination()).resolves.toBeNull()
    await expect(archiveApi.listApprovedPersonaDraftPublications({
      draftReviewId: 'review-1'
    })).resolves.toEqual([])
    await expect(archiveApi.publishApprovedPersonaDraft({
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/persona-draft-publications'
    })).resolves.toBeNull()
    await expect(archiveApi.openApprovedDraftPublicationEntry({
      entryPath: '/tmp/persona-draft-publications/approved-draft-publication-publication-1/index.html'
    })).resolves.toEqual({
      status: 'failed',
      entryPath: '/tmp/persona-draft-publications/approved-draft-publication-publication-1/index.html',
      errorMessage: 'archive api unavailable'
    })
    await expect(archiveApi.getApprovedDraftHostedShareHostStatus()).resolves.toEqual({
      availability: 'unconfigured',
      hostKind: null,
      hostLabel: null
    })
    await expect(archiveApi.openApprovedDraftHostedShareLink({
      shareUrl: 'https://share.example.test/s/abc123'
    })).resolves.toEqual({
      status: 'failed',
      shareUrl: 'https://share.example.test/s/abc123',
      errorMessage: 'archive api unavailable'
    })
    await expect(archiveApi.listApprovedPersonaDraftProviderSends({
      draftReviewId: 'review-1'
    })).resolves.toEqual([])
    await expect(archiveApi.listApprovedDraftSendDestinations()).resolves.toEqual([])
    await expect(archiveApi.sendApprovedPersonaDraftToProvider({
      draftReviewId: 'review-1',
      destinationId: 'openrouter-qwen25-72b'
    })).resolves.toBeNull()
    await expect(archiveApi.retryApprovedPersonaDraftProviderSend({
      artifactId: 'pdpe-failed-1'
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
      question: '她过去是怎么表达记录和归档这类事的？给我看原话。',
      sessionId: 'session-1'
    })

    expect(askMemoryWorkspacePersisted).toHaveBeenCalledWith({
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她过去是怎么表达记录和归档这类事的？给我看原话。',
      sessionId: 'session-1'
    })
    expect(turn?.response.contextCards.map((card) => card.title)).toContain('Conversation Context')
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
