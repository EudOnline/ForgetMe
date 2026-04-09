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

  it('exposes person-agent inspection methods through contextBridge', async () => {
    await import('../../../src/preload/index')

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1)

    const archiveApi = exposeInMainWorld.mock.calls[0]?.[1] as {
      getPersonAgentState: (input: { canonicalPersonId: string }) => Promise<unknown>
      listPersonAgentRefreshQueue: (input?: { status?: 'pending' | 'processing' | 'completed' | 'failed' }) => Promise<unknown>
      getPersonAgentMemorySummary: (input: { canonicalPersonId: string }) => Promise<unknown>
    }

    await archiveApi.getPersonAgentState({ canonicalPersonId: 'cp-1' })
    await archiveApi.listPersonAgentRefreshQueue({ status: 'pending' })
    await archiveApi.getPersonAgentMemorySummary({ canonicalPersonId: 'cp-1' })

    expect(invoke).toHaveBeenNthCalledWith(1, 'archive:getPersonAgentState', {
      canonicalPersonId: 'cp-1'
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'archive:listPersonAgentRefreshQueue', {
      status: 'pending'
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'archive:getPersonAgentMemorySummary', {
      canonicalPersonId: 'cp-1'
    })
  })

  it('exposes unified capsule runtime execution and inspection methods through contextBridge', async () => {
    await import('../../../src/preload/index')

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1)

    const archiveApi = exposeInMainWorld.mock.calls[0]?.[1] as {
      runPersonAgentCapsuleRuntime: (input: Record<string, unknown>) => Promise<unknown>
      getPersonAgentCapsuleRuntimeInspection: (input: { canonicalPersonId: string }) => Promise<unknown>
    }

    await archiveApi.runPersonAgentCapsuleRuntime({
      operationKind: 'consultation',
      canonicalPersonId: 'cp-1',
      question: '她的生日是什么？',
      sessionId: 'pcs-1'
    })
    await archiveApi.getPersonAgentCapsuleRuntimeInspection({
      canonicalPersonId: 'cp-1'
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'archive:runPersonAgentCapsuleRuntime', {
      operationKind: 'consultation',
      canonicalPersonId: 'cp-1',
      question: '她的生日是什么？',
      sessionId: 'pcs-1'
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'archive:getPersonAgentCapsuleRuntimeInspection', {
      canonicalPersonId: 'cp-1'
    })
  })

})
