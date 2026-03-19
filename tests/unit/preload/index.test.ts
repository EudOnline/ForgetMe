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
})
