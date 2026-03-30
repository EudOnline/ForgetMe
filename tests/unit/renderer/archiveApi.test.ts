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
  it('exposes only objective runtime methods in the fallback API', async () => {
    vi.stubGlobal('window', {})

    const archiveApi = getArchiveApi()
    const archiveApiRecord = archiveApi as unknown as Record<string, unknown>

    await expect(archiveApi.createAgentObjective({
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the source before we answer the user.',
      initiatedBy: 'operator'
    })).resolves.toEqual(expect.objectContaining({
      objectiveId: '',
      objectiveKind: 'evidence_investigation',
      status: 'in_progress',
      ownerRole: 'workspace'
    }))
    await expect(archiveApi.listAgentObjectives({
      ownerRole: 'workspace'
    })).resolves.toEqual([])
    await expect(archiveApi.getAgentObjective({
      objectiveId: 'objective-1'
    })).resolves.toBeNull()
    await expect(archiveApi.getAgentThread({
      threadId: 'thread-main-1'
    })).resolves.toBeNull()
    await expect(archiveApi.respondToAgentProposal({
      proposalId: 'proposal-1',
      responderRole: 'governance',
      response: 'challenge',
      comment: 'Need a bounded verification policy before this can proceed.'
    })).resolves.toBeNull()
    await expect(archiveApi.confirmAgentProposal({
      proposalId: 'proposal-1',
      decision: 'confirm',
      operatorNote: 'Confirmed after reviewing the evidence bundle.'
    })).resolves.toBeNull()

    expect('previewAgentTask' in archiveApiRecord).toBe(false)
    expect('runAgentTask' in archiveApiRecord).toBe(false)
    expect('listAgentRuns' in archiveApiRecord).toBe(false)
    expect('getAgentRun' in archiveApiRecord).toBe(false)
    expect('listAgentSuggestions' in archiveApiRecord).toBe(false)
    expect('refreshAgentSuggestions' in archiveApiRecord).toBe(false)
    expect('dismissAgentSuggestion' in archiveApiRecord).toBe(false)
    expect('runAgentSuggestion' in archiveApiRecord).toBe(false)
    expect('getAgentRuntimeSettings' in archiveApiRecord).toBe(false)
    expect('updateAgentRuntimeSettings' in archiveApiRecord).toBe(false)
  })

  it('preserves renderer-provided objective runtime methods and omits old execution APIs', async () => {
    const createAgentObjective = vi.fn().mockResolvedValue({
      objectiveId: 'objective-1',
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      status: 'in_progress',
      prompt: 'Check the source before we answer the user.',
      initiatedBy: 'operator',
      ownerRole: 'workspace',
      mainThreadId: 'thread-main-1',
      riskLevel: 'medium',
      budget: null,
      requiresOperatorInput: false,
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      threads: [
        {
          threadId: 'thread-main-1',
          objectiveId: 'objective-1',
          parentThreadId: null,
          threadKind: 'main',
          ownerRole: 'workspace',
          title: 'Verify an external claim before responding · Main Thread',
          status: 'open',
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
          closedAt: null
        }
      ],
      participants: [],
      proposals: [],
      checkpoints: [],
      subagents: []
    })
    const listAgentObjectives = vi.fn().mockResolvedValue([
      {
        objectiveId: 'objective-1',
        title: 'Verify an external claim before responding',
        objectiveKind: 'evidence_investigation',
        status: 'in_progress',
        prompt: 'Check the source before we answer the user.',
        initiatedBy: 'operator',
        ownerRole: 'workspace',
        mainThreadId: 'thread-main-1',
        riskLevel: 'medium',
        budget: null,
        requiresOperatorInput: false,
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z'
      }
    ])
    const getAgentObjective = vi.fn().mockResolvedValue({
      objectiveId: 'objective-1',
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      status: 'in_progress',
      prompt: 'Check the source before we answer the user.',
      initiatedBy: 'operator',
      ownerRole: 'workspace',
      mainThreadId: 'thread-main-1',
      riskLevel: 'medium',
      budget: null,
      requiresOperatorInput: false,
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      threads: [
        {
          threadId: 'thread-main-1',
          objectiveId: 'objective-1',
          parentThreadId: null,
          threadKind: 'main',
          ownerRole: 'workspace',
          title: 'Verify an external claim before responding · Main Thread',
          status: 'open',
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
          closedAt: null
        }
      ],
      participants: [],
      proposals: [
        {
          proposalId: 'proposal-1',
          objectiveId: 'objective-1',
          threadId: 'thread-main-1',
          proposedByParticipantId: 'workspace',
          proposalKind: 'verify_external_claim',
          payload: {
            claim: 'The external source confirms the announcement date.'
          },
          ownerRole: 'workspace',
          status: 'awaiting_operator',
          requiredApprovals: ['workspace'],
          allowVetoBy: ['governance'],
          requiresOperatorConfirmation: true,
          toolPolicyId: 'tool-policy-web-1',
          budget: {
            maxRounds: 2,
            maxToolCalls: 3,
            timeoutMs: 30_000
          },
          derivedFromMessageIds: [],
          artifactRefs: [],
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
          committedAt: null
        }
      ],
      checkpoints: [],
      subagents: []
    })
    const getAgentThread = vi.fn().mockResolvedValue({
      threadId: 'thread-main-1',
      objectiveId: 'objective-1',
      parentThreadId: null,
      threadKind: 'main',
      ownerRole: 'workspace',
      title: 'Verify an external claim before responding · Main Thread',
      status: 'open',
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      closedAt: null,
      participants: [],
      messages: [
        {
          messageId: 'message-1',
          objectiveId: 'objective-1',
          threadId: 'thread-main-1',
          fromParticipantId: 'workspace',
          toParticipantId: null,
          kind: 'goal',
          body: 'Check the source before we answer the user.',
          refs: [],
          replyToMessageId: null,
          round: 1,
          confidence: null,
          blocking: false,
          createdAt: '2026-03-30T00:00:00.000Z'
        }
      ],
      proposals: [],
      votes: [],
      checkpoints: [],
      subagents: []
    })
    const respondToAgentProposal = vi.fn().mockResolvedValue({
      proposalId: 'proposal-1',
      objectiveId: 'objective-1',
      threadId: 'thread-main-1',
      proposedByParticipantId: 'workspace',
      proposalKind: 'verify_external_claim',
      payload: {
        claim: 'The external source confirms the announcement date.'
      },
      ownerRole: 'workspace',
      status: 'challenged',
      requiredApprovals: ['workspace'],
      allowVetoBy: ['governance'],
      requiresOperatorConfirmation: true,
      toolPolicyId: 'tool-policy-web-1',
      budget: {
        maxRounds: 2,
        maxToolCalls: 3,
        timeoutMs: 30_000
      },
      derivedFromMessageIds: [],
      artifactRefs: [],
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:01:00.000Z',
      committedAt: null
    })
    const confirmAgentProposal = vi.fn().mockResolvedValue({
      proposalId: 'proposal-1',
      objectiveId: 'objective-1',
      threadId: 'thread-main-1',
      proposedByParticipantId: 'workspace',
      proposalKind: 'verify_external_claim',
      payload: {
        claim: 'The external source confirms the announcement date.'
      },
      ownerRole: 'workspace',
      status: 'committed',
      requiredApprovals: ['workspace'],
      allowVetoBy: ['governance'],
      requiresOperatorConfirmation: true,
      toolPolicyId: 'tool-policy-web-1',
      budget: {
        maxRounds: 2,
        maxToolCalls: 3,
        timeoutMs: 30_000
      },
      derivedFromMessageIds: [],
      artifactRefs: [],
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:02:00.000Z',
      committedAt: '2026-03-30T00:02:00.000Z'
    })

    vi.stubGlobal('window', {
      archiveApi: {
        createAgentObjective,
        listAgentObjectives,
        getAgentObjective,
        getAgentThread,
        respondToAgentProposal,
        confirmAgentProposal
      }
    })

    const archiveApi = getArchiveApi()
    const archiveApiRecord = archiveApi as unknown as Record<string, unknown>
    const createdObjective = await archiveApi.createAgentObjective({
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the source before we answer the user.',
      initiatedBy: 'operator'
    })
    const objectives = await archiveApi.listAgentObjectives({
      ownerRole: 'workspace'
    })
    const objective = await archiveApi.getAgentObjective({
      objectiveId: 'objective-1'
    })
    const thread = await archiveApi.getAgentThread({
      threadId: 'thread-main-1'
    })
    const challengedProposal = await archiveApi.respondToAgentProposal({
      proposalId: 'proposal-1',
      responderRole: 'governance',
      response: 'challenge',
      comment: 'Need a bounded verification policy before this can proceed.'
    })
    const confirmedProposal = await archiveApi.confirmAgentProposal({
      proposalId: 'proposal-1',
      decision: 'confirm',
      operatorNote: 'Confirmed after reviewing the evidence bundle.'
    })

    expect(createdObjective.objectiveId).toBe('objective-1')
    expect(createdObjective.mainThreadId).toBe('thread-main-1')
    expect(objectives[0]?.objectiveId).toBe('objective-1')
    expect(objective?.proposals[0]?.proposalId).toBe('proposal-1')
    expect(thread?.messages[0]?.body).toContain('Check the source')
    expect(challengedProposal?.status).toBe('challenged')
    expect(confirmedProposal?.status).toBe('committed')
    expect('previewAgentTask' in archiveApiRecord).toBe(false)
    expect('runAgentTask' in archiveApiRecord).toBe(false)
    expect('listAgentRuns' in archiveApiRecord).toBe(false)
    expect('getAgentRun' in archiveApiRecord).toBe(false)
    expect('listAgentSuggestions' in archiveApiRecord).toBe(false)
    expect('refreshAgentSuggestions' in archiveApiRecord).toBe(false)
    expect('dismissAgentSuggestion' in archiveApiRecord).toBe(false)
    expect('runAgentSuggestion' in archiveApiRecord).toBe(false)
    expect('getAgentRuntimeSettings' in archiveApiRecord).toBe(false)
    expect('updateAgentRuntimeSettings' in archiveApiRecord).toBe(false)
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
