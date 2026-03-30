import { beforeEach, describe, expect, it, vi } from 'vitest'

const { exposeInMainWorld, invoke } = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld
  },
  ipcRenderer: {
    invoke
  }
}))

describe('preload archiveApi hosted share bridge', () => {
  beforeEach(() => {
    vi.resetModules()
    exposeInMainWorld.mockReset()
    invoke.mockReset()
  })

  it('exposes hosted share methods through contextBridge', async () => {
    await import('../../../src/preload/index')

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1)
    expect(exposeInMainWorld).toHaveBeenCalledWith('archiveApi', expect.any(Object))

    const archiveApi = exposeInMainWorld.mock.calls[0]?.[1] as {
      getApprovedDraftHostedShareHostStatus: () => Promise<unknown>
      listApprovedPersonaDraftHostedShareLinks: (input: { draftReviewId: string }) => Promise<unknown>
      createApprovedPersonaDraftHostedShareLink: (input: { draftReviewId: string }) => Promise<unknown>
      revokeApprovedPersonaDraftHostedShareLink: (input: { shareLinkId: string }) => Promise<unknown>
      openApprovedDraftHostedShareLink: (input: { shareUrl: string }) => Promise<unknown>
    }

    await archiveApi.getApprovedDraftHostedShareHostStatus()
    await archiveApi.listApprovedPersonaDraftHostedShareLinks({ draftReviewId: 'review-1' })
    await archiveApi.createApprovedPersonaDraftHostedShareLink({ draftReviewId: 'review-1' })
    await archiveApi.revokeApprovedPersonaDraftHostedShareLink({ shareLinkId: 'share-1' })
    await archiveApi.openApprovedDraftHostedShareLink({ shareUrl: 'https://share.example.test/s/abc123' })

    expect(invoke).toHaveBeenNthCalledWith(1, 'archive:getApprovedDraftHostedShareHostStatus')
    expect(invoke).toHaveBeenNthCalledWith(2, 'archive:listApprovedPersonaDraftHostedShareLinks', {
      draftReviewId: 'review-1'
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'archive:createApprovedPersonaDraftHostedShareLink', {
      draftReviewId: 'review-1'
    })
    expect(invoke).toHaveBeenNthCalledWith(4, 'archive:revokeApprovedPersonaDraftHostedShareLink', {
      shareLinkId: 'share-1'
    })
    expect(invoke).toHaveBeenNthCalledWith(5, 'archive:openApprovedDraftHostedShareLink', {
      shareUrl: 'https://share.example.test/s/abc123'
    })
  })

  it('passes persisted memory workspace asks with session ids through contextBridge', async () => {
    await import('../../../src/preload/index')

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1)

    const archiveApi = exposeInMainWorld.mock.calls[0]?.[1] as {
      askMemoryWorkspacePersisted: (input: {
        scope: { kind: 'person'; canonicalPersonId: string }
        question: string
        expressionMode: 'advice'
        sessionId: string
      }) => Promise<unknown>
    }

    await archiveApi.askMemoryWorkspacePersisted({
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '那为什么这个冲突最值得先处理？',
      expressionMode: 'advice',
      sessionId: 'session-1'
    })

    expect(invoke).toHaveBeenCalledWith('archive:askMemoryWorkspacePersisted', {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '那为什么这个冲突最值得先处理？',
      expressionMode: 'advice',
      sessionId: 'session-1'
    })
  })

  it('exposes agent runtime methods through contextBridge', async () => {
    await import('../../../src/preload/index')

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1)

    invoke
      .mockResolvedValueOnce({
        taskKind: 'review.apply_item_decision',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        requiresConfirmation: true
      })
      .mockResolvedValueOnce({
        runId: 'run-1',
        status: 'completed',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        latestAssistantResponse: '1 pending items across 1 conflict groups.'
      })
      .mockResolvedValueOnce([
        {
          runId: 'run-1',
          role: 'review',
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
      .mockResolvedValueOnce({
        runId: 'run-1',
        role: 'review',
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
        messages: []
      })
      .mockResolvedValueOnce([
        {
          memoryId: 'memory-1',
          role: 'governance',
          memoryKey: 'governance.feedback',
          memoryValue: 'Prefer queue summaries first.',
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          policyVersionId: 'policy-1',
          role: 'governance',
          policyKey: 'governance.review.policy',
          policyBody: 'Prefer queue summaries first.',
          createdAt: '2026-03-29T00:00:01.000Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          suggestionId: 'suggestion-1',
          triggerKind: 'governance.failed_runs_detected',
          status: 'suggested',
          role: 'governance',
          taskKind: 'governance.summarize_failures',
          taskInput: {
            role: 'governance',
            taskKind: 'governance.summarize_failures',
            prompt: 'Summarize failed agent runs from the proactive monitor.'
          },
          dedupeKey: 'governance.failed-runs::latest',
          sourceRunId: null,
          executedRunId: null,
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
          lastObservedAt: '2026-03-30T00:00:00.000Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          suggestionId: 'suggestion-1',
          triggerKind: 'governance.failed_runs_detected',
          status: 'suggested',
          role: 'governance',
          taskKind: 'governance.summarize_failures',
          taskInput: {
            role: 'governance',
            taskKind: 'governance.summarize_failures',
            prompt: 'Summarize failed agent runs from the proactive monitor.'
          },
          dedupeKey: 'governance.failed-runs::latest',
          sourceRunId: null,
          executedRunId: null,
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
          lastObservedAt: '2026-03-30T00:00:00.000Z'
        }
      ])
      .mockResolvedValueOnce({
        suggestionId: 'suggestion-1',
        triggerKind: 'governance.failed_runs_detected',
        status: 'dismissed',
        role: 'governance',
        taskKind: 'governance.summarize_failures',
        taskInput: {
          role: 'governance',
          taskKind: 'governance.summarize_failures',
          prompt: 'Summarize failed agent runs from the proactive monitor.'
        },
        dedupeKey: 'governance.failed-runs::latest',
        sourceRunId: null,
        executedRunId: null,
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:05.000Z',
        lastObservedAt: '2026-03-30T00:00:00.000Z'
      })
      .mockResolvedValueOnce({
        runId: 'run-from-suggestion-1',
        status: 'completed',
        targetRole: 'governance',
        assignedRoles: ['governance'],
        latestAssistantResponse: 'Failures summarized.'
      })

    const archiveApi = exposeInMainWorld.mock.calls[0]?.[1] as {
      previewAgentTask: (input: { prompt: string; role: 'orchestrator' }) => Promise<unknown>
      runAgentTask: (input: { prompt: string; role: 'orchestrator' }) => Promise<unknown>
      listAgentRuns: (input: { role: 'review' }) => Promise<unknown>
      getAgentRun: (input: { runId: string }) => Promise<unknown>
      listAgentMemories: (input: { role: 'governance' }) => Promise<unknown>
      listAgentPolicyVersions: (input: { role: 'governance'; policyKey: string }) => Promise<unknown>
      listAgentSuggestions: (input: { role: 'governance'; status: 'suggested'; limit: number }) => Promise<unknown>
      refreshAgentSuggestions: () => Promise<unknown>
      dismissAgentSuggestion: (input: { suggestionId: string }) => Promise<unknown>
      runAgentSuggestion: (input: { suggestionId: string; confirmationToken: string }) => Promise<unknown>
    }

    const preview = await archiveApi.previewAgentTask({
      prompt: 'Approve review item rq-1',
      role: 'orchestrator'
    })
    const runResult = await archiveApi.runAgentTask({
      prompt: 'Summarize the highest-priority pending review work',
      role: 'orchestrator'
    })
    const runs = await archiveApi.listAgentRuns({ role: 'review' })
    const detail = await archiveApi.getAgentRun({ runId: 'run-1' })
    const memories = await archiveApi.listAgentMemories({ role: 'governance' })
    const policyVersions = await archiveApi.listAgentPolicyVersions({
      role: 'governance',
      policyKey: 'governance.review.policy'
    })
    const suggestions = await archiveApi.listAgentSuggestions({
      role: 'governance',
      status: 'suggested',
      limit: 10
    })
    const refreshedSuggestions = await archiveApi.refreshAgentSuggestions()
    const dismissed = await archiveApi.dismissAgentSuggestion({
      suggestionId: 'suggestion-1'
    })
    const runSuggestionResult = await archiveApi.runAgentSuggestion({
      suggestionId: 'suggestion-1',
      confirmationToken: 'confirm-1'
    })

    expect(preview).toEqual({
      taskKind: 'review.apply_item_decision',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      requiresConfirmation: true
    })
    expect(runResult).toEqual({
      runId: 'run-1',
      status: 'completed',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      latestAssistantResponse: '1 pending items across 1 conflict groups.'
    })
    expect(runs).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        targetRole: 'review',
        assignedRoles: ['orchestrator', 'review'],
        latestAssistantResponse: '1 pending items across 1 conflict groups.'
      })
    ])
    expect(detail).toEqual(expect.objectContaining({
      runId: 'run-1',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      latestAssistantResponse: '1 pending items across 1 conflict groups.',
      messages: []
    }))
    expect(memories).toEqual([
      expect.objectContaining({
        memoryId: 'memory-1',
        role: 'governance'
      })
    ])
    expect(policyVersions).toEqual([
      expect.objectContaining({
        policyVersionId: 'policy-1',
        role: 'governance',
        policyKey: 'governance.review.policy'
      })
    ])
    expect(suggestions).toEqual([
      expect.objectContaining({
        suggestionId: 'suggestion-1',
        status: 'suggested',
        role: 'governance'
      })
    ])
    expect(refreshedSuggestions).toEqual([
      expect.objectContaining({
        suggestionId: 'suggestion-1',
        status: 'suggested',
        role: 'governance'
      })
    ])
    expect(dismissed).toEqual(expect.objectContaining({
      suggestionId: 'suggestion-1',
      status: 'dismissed'
    }))
    expect(runSuggestionResult).toEqual({
      runId: 'run-from-suggestion-1',
      status: 'completed',
      targetRole: 'governance',
      assignedRoles: ['governance'],
      latestAssistantResponse: 'Failures summarized.'
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'archive:previewAgentTask', {
      prompt: 'Approve review item rq-1',
      role: 'orchestrator'
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'archive:runAgentTask', {
      prompt: 'Summarize the highest-priority pending review work',
      role: 'orchestrator'
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'archive:listAgentRuns', {
      role: 'review'
    })
    expect(invoke).toHaveBeenNthCalledWith(4, 'archive:getAgentRun', {
      runId: 'run-1'
    })
    expect(invoke).toHaveBeenNthCalledWith(5, 'archive:listAgentMemories', {
      role: 'governance'
    })
    expect(invoke).toHaveBeenNthCalledWith(6, 'archive:listAgentPolicyVersions', {
      role: 'governance',
      policyKey: 'governance.review.policy'
    })
    expect(invoke).toHaveBeenNthCalledWith(7, 'archive:listAgentSuggestions', {
      role: 'governance',
      status: 'suggested',
      limit: 10
    })
    expect(invoke).toHaveBeenNthCalledWith(8, 'archive:refreshAgentSuggestions')
    expect(invoke).toHaveBeenNthCalledWith(9, 'archive:dismissAgentSuggestion', {
      suggestionId: 'suggestion-1'
    })
    expect(invoke).toHaveBeenNthCalledWith(10, 'archive:runAgentSuggestion', {
      suggestionId: 'suggestion-1',
      confirmationToken: 'confirm-1'
    })
  })
})
