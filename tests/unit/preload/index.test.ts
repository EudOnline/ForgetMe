import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

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

describe('preload archiveApi bridge', () => {
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

  it('is assembled from preload modules instead of one inline archiveApi object', () => {
    const source = fs.readFileSync(
      path.resolve('src/preload/index.ts'),
      'utf8'
    )

    expect(source).toContain("from './modules/import'")
    expect(source).toContain("from './modules/review'")
    expect(source).toContain("from './modules/workspace'")
    expect(source).toContain("from './modules/objective'")
    expect(source).toContain('Object.assign')
    expect(source).not.toContain('const archiveApi')
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

  it('exposes objective runtime methods and omits obsolete run-centric bridges', async () => {
    await import('../../../src/preload/index')

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1)

    invoke
      .mockResolvedValueOnce({
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
        threads: [],
        participants: [],
        proposals: [],
        checkpoints: [],
        subagents: []
      })
      .mockResolvedValueOnce([
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
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const archiveApi = exposeInMainWorld.mock.calls[0]?.[1] as Record<string, unknown> & {
      createAgentObjective: (input: {
        title: string
        objectiveKind: 'evidence_investigation'
        prompt: string
        initiatedBy: 'operator'
      }) => Promise<unknown>
      refreshObjectiveTriggers: () => Promise<unknown>
      listAgentObjectives: (input: { ownerRole: 'workspace' }) => Promise<unknown>
      getAgentObjective: (input: { objectiveId: string }) => Promise<unknown>
      getAgentThread: (input: { threadId: string }) => Promise<unknown>
      respondToAgentProposal: (input: {
        proposalId: string
        responderRole: 'governance'
        response: 'challenge'
        comment: string
      }) => Promise<unknown>
      confirmAgentProposal: (input: {
        proposalId: string
        decision: 'confirm'
        operatorNote: string
      }) => Promise<unknown>
    }

    expect('previewAgentTask' in archiveApi).toBe(false)
    expect('runAgentTask' in archiveApi).toBe(false)
    expect('listAgentRuns' in archiveApi).toBe(false)
    expect('getAgentRun' in archiveApi).toBe(false)
    expect('listAgentSuggestions' in archiveApi).toBe(false)
    expect('refreshAgentSuggestions' in archiveApi).toBe(false)
    expect('dismissAgentSuggestion' in archiveApi).toBe(false)
    expect('runAgentSuggestion' in archiveApi).toBe(false)
    expect('getAgentRuntimeSettings' in archiveApi).toBe(false)
    expect('updateAgentRuntimeSettings' in archiveApi).toBe(false)

    await archiveApi.createAgentObjective({
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the source before we answer the user.',
      initiatedBy: 'operator'
    })
    await archiveApi.refreshObjectiveTriggers()
    await archiveApi.listAgentObjectives({ ownerRole: 'workspace' })
    await archiveApi.getAgentObjective({ objectiveId: 'objective-1' })
    await archiveApi.getAgentThread({ threadId: 'thread-main-1' })
    await archiveApi.respondToAgentProposal({
      proposalId: 'proposal-1',
      responderRole: 'governance',
      response: 'challenge',
      comment: 'Need a bounded verification policy before this can proceed.'
    })
    await archiveApi.confirmAgentProposal({
      proposalId: 'proposal-1',
      decision: 'confirm',
      operatorNote: 'Confirmed after reviewing the evidence bundle.'
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'archive:createAgentObjective', {
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the source before we answer the user.',
      initiatedBy: 'operator'
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'archive:refreshObjectiveTriggers')
    expect(invoke).toHaveBeenNthCalledWith(3, 'archive:listAgentObjectives', {
      ownerRole: 'workspace'
    })
    expect(invoke).toHaveBeenNthCalledWith(4, 'archive:getAgentObjective', {
      objectiveId: 'objective-1'
    })
    expect(invoke).toHaveBeenNthCalledWith(5, 'archive:getAgentThread', {
      threadId: 'thread-main-1'
    })
    expect(invoke).toHaveBeenNthCalledWith(6, 'archive:respondToAgentProposal', {
      proposalId: 'proposal-1',
      responderRole: 'governance',
      response: 'challenge',
      comment: 'Need a bounded verification policy before this can proceed.'
    })
    expect(invoke).toHaveBeenNthCalledWith(7, 'archive:confirmAgentProposal', {
      proposalId: 'proposal-1',
      decision: 'confirm',
      operatorNote: 'Confirmed after reviewing the evidence bundle.'
    })
  })
})
