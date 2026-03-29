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

    const archiveApi = exposeInMainWorld.mock.calls[0]?.[1] as {
      runAgentTask: (input: { prompt: string; role: 'orchestrator' }) => Promise<unknown>
      listAgentRuns: (input: { role: 'review' }) => Promise<unknown>
      getAgentRun: (input: { runId: string }) => Promise<unknown>
      listAgentMemories: (input: { role: 'governance' }) => Promise<unknown>
    }

    await archiveApi.runAgentTask({
      prompt: 'Summarize the highest-priority pending review work',
      role: 'orchestrator'
    })
    await archiveApi.listAgentRuns({ role: 'review' })
    await archiveApi.getAgentRun({ runId: 'run-1' })
    await archiveApi.listAgentMemories({ role: 'governance' })

    expect(invoke).toHaveBeenNthCalledWith(1, 'archive:runAgentTask', {
      prompt: 'Summarize the highest-priority pending review work',
      role: 'orchestrator'
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'archive:listAgentRuns', {
      role: 'review'
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'archive:getAgentRun', {
      runId: 'run-1'
    })
    expect(invoke).toHaveBeenNthCalledWith(4, 'archive:listAgentMemories', {
      role: 'governance'
    })
  })
})
