import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

type RecordedHostRequest = {
  method: string
  url: string
  headers: http.IncomingHttpHeaders
  body: Record<string, unknown>
}

async function startHostedShareFixtureServer() {
  const requests: RecordedHostRequest[] = []
  const server = http.createServer((request, response) => {
    let rawBody = ''

    request.on('data', (chunk) => {
      rawBody += chunk.toString()
    })

    request.on('end', () => {
      const body = rawBody.length > 0 ? JSON.parse(rawBody) as Record<string, unknown> : {}
      requests.push({
        method: request.method ?? 'GET',
        url: request.url ?? '/',
        headers: request.headers,
        body
      })

      if (request.method === 'POST' && request.url === '/api/approved-draft-share-links') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          remoteShareId: 'remote-share-1',
          shareUrl: 'https://share.example.test/s/remote-share-1'
        }))
        return
      }

      if (request.method === 'POST' && request.url === '/api/approved-draft-share-links/remote-share-1/revoke') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ status: 'revoked' }))
        return
      }

      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'not found' }))
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Hosted share fixture server did not bind to a TCP port.')
  }

  return {
    server,
    requests,
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`
  }
}

async function closeServer(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

async function importFixtureAndOpenAliceWorkspace(page: Page, fixtureFileName: string) {
  await page.getByText('Choose Files').click()
  await expect(page.getByRole('button', { name: fixtureFileName })).toBeVisible()

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByRole('button', { name: /^Alice Chen$/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Alice Chen$/ }).click()
  await expect(page.getByRole('heading', { name: 'Person Dossier' })).toBeVisible()
  await page.getByRole('button', { name: 'Open memory workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Memory Workspace', exact: true })).toBeVisible()
}

async function approveDraftAndPublish(page: Page, publicationDir: string) {
  await page.getByLabel('Ask memory workspace').fill('如果她本人会怎么建议我？请模仿她的口吻回答。')
  await page.getByRole('button', { name: 'Ask' }).click()

  await expect(page.getByRole('button', { name: 'Reviewed draft sandbox' })).toBeVisible()
  await page.getByRole('button', { name: 'Reviewed draft sandbox' }).click()

  const sandboxTurn = page.locator('section[aria-label="Turn 2"]')
  await expect(sandboxTurn.getByRole('button', { name: 'Start draft review' })).toBeVisible()
  await sandboxTurn.getByRole('button', { name: 'Start draft review' }).click()

  await sandboxTurn.getByLabel('Draft review body').fill('可审阅草稿：先把关键记录整理进归档，再补齐细节。')
  await sandboxTurn.getByLabel('Draft review notes').fill('Approved for hosted share link flow.')
  await sandboxTurn.getByRole('button', { name: 'Save draft edits' }).click()

  await sandboxTurn.getByRole('button', { name: 'Mark in review' }).click()
  await expect(sandboxTurn.getByText('Status: in review')).toBeVisible()

  await sandboxTurn.getByRole('button', { name: 'Approve draft' }).click()
  await expect(sandboxTurn.getByText('Status: approved')).toBeVisible()
  await expect(sandboxTurn.getByRole('heading', { name: 'Approved Draft Handoff' })).toBeVisible()

  await sandboxTurn.getByRole('button', { name: 'Choose publish destination' }).click()
  await expect(sandboxTurn.getByText(publicationDir)).toBeVisible()
  await sandboxTurn.getByRole('button', { name: 'Publish approved draft' }).click()

  await expect(sandboxTurn.getByText('Published publication.json')).toBeVisible()
  await expect(sandboxTurn.getByRole('heading', { name: 'Hosted Share Link' })).toBeVisible()
  await expect(sandboxTurn.getByRole('button', { name: 'Create hosted share link' })).toBeVisible()

  return sandboxTurn
}

test('memory workspace approved draft hosted share links create and revoke through a configured host', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10m-hosted-share-user-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10m-hosted-share-fixtures-'))
  const publicationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-phase10m-hosted-share-output-'))
  const chatFixture = path.join(fixtureDir, 'chat-phase10m-hosted-share.json')
  fs.writeFileSync(chatFixture, JSON.stringify({
    messages: [
      { sender: 'Alice Chen', text: '我们还是把这些记录留在归档里，后面查起来更稳妥。' },
      { sender: 'Alice Chen', text: '我会继续记下关键细节，归档后就不会丢。' }
    ]
  }))

  let electronApp: ElectronApplication | null = null
  let fixtureServer: Awaited<ReturnType<typeof startHostedShareFixtureServer>> | null = null

  try {
    fixtureServer = await startHostedShareFixtureServer()
    electronApp = await electron.launch({
      args: [path.resolve('out/main/index.js')],
      env: {
        ...process.env,
        FORGETME_E2E_FIXTURE: chatFixture,
        FORGETME_E2E_USER_DATA_DIR: userDataDir,
        FORGETME_E2E_APPROVED_DRAFT_PUBLICATION_DESTINATION_DIR: publicationDir,
        FORGETME_APPROVED_DRAFT_SHARE_HOST_BASE_URL: fixtureServer.baseUrl,
        FORGETME_APPROVED_DRAFT_SHARE_HOST_TOKEN: 'token-123'
      }
    })

    const page = await electronApp.firstWindow()
    await importFixtureAndOpenAliceWorkspace(page, 'chat-phase10m-hosted-share.json')
    const sandboxTurn = await approveDraftAndPublish(page, publicationDir)

    await sandboxTurn.getByRole('button', { name: 'Create hosted share link' }).click()

    await expect.poll(() => fixtureServer?.requests.length ?? 0).toBe(1)
    await expect(sandboxTurn.getByRole('heading', { name: 'Hosted Share Link' })).toBeVisible()
    await expect(sandboxTurn.getByText('https://share.example.test/s/remote-share-1')).toBeVisible()
    await expect(sandboxTurn.getByText('Status: active')).toBeVisible()
    await expect(sandboxTurn.getByRole('button', { name: 'Revoke hosted share link' })).toBeVisible()

    const createRequest = fixtureServer.requests[0]
    expect(createRequest).toBeDefined()
    expect(createRequest?.method).toBe('POST')
    expect(createRequest?.url).toBe('/api/approved-draft-share-links')
    expect(createRequest?.headers.authorization).toBe('Bearer token-123')
    expect(createRequest?.body).toMatchObject({
      requestShape: 'approved_draft_hosted_share_link_create',
      shareLinkId: expect.any(String),
      publicationId: expect.any(String),
      draftReviewId: expect.any(String),
      sourceTurnId: expect.any(String),
      publicArtifactSha256: expect.any(String),
      manifest: expect.objectContaining({
        publicArtifactFileName: 'publication.json'
      }),
      publication: expect.objectContaining({
        publicationKind: 'local_share_package'
      }),
      displayEntry: expect.objectContaining({
        fileName: 'index.html',
        html: expect.any(String)
      }),
      displayStyles: expect.objectContaining({
        fileName: 'styles.css',
        css: expect.any(String)
      })
    })
    expect(createRequest?.body).not.toHaveProperty('packageRoot')
    expect(createRequest?.body).not.toHaveProperty('manifestPath')
    expect(createRequest?.body).not.toHaveProperty('publicArtifactPath')
    expect(createRequest?.body).not.toHaveProperty('displayEntryPath')
    expect(createRequest?.body).not.toHaveProperty('displayStylesPath')

    const createRequestBody = JSON.stringify(createRequest?.body)
    expect(createRequestBody).not.toContain(publicationDir)
    expect(createRequestBody).not.toContain(userDataDir)
    expect(createRequestBody).not.toContain(chatFixture)

    await sandboxTurn.getByRole('button', { name: 'Revoke hosted share link' }).click()

    await expect.poll(() => fixtureServer?.requests.length ?? 0).toBe(2)
    await expect(sandboxTurn.getByText('Status: revoked')).toBeVisible()
    await expect(sandboxTurn.locator('li').filter({ hasText: /^revoked · / })).toBeVisible()

    const revokeRequest = fixtureServer.requests[1]
    expect(revokeRequest).toBeDefined()
    expect(revokeRequest?.method).toBe('POST')
    expect(revokeRequest?.url).toBe('/api/approved-draft-share-links/remote-share-1/revoke')
    expect(revokeRequest?.headers.authorization).toBe('Bearer token-123')
    expect(revokeRequest?.body).toMatchObject({
      shareLinkId: (createRequest?.body.shareLinkId as string | undefined) ?? expect.any(String),
      publicationId: (createRequest?.body.publicationId as string | undefined) ?? expect.any(String),
      draftReviewId: (createRequest?.body.draftReviewId as string | undefined) ?? expect.any(String),
      sourceTurnId: (createRequest?.body.sourceTurnId as string | undefined) ?? expect.any(String),
      remoteShareId: 'remote-share-1',
      shareUrl: 'https://share.example.test/s/remote-share-1'
    })
  } finally {
    if (electronApp) {
      await electronApp.close()
    }
    if (fixtureServer) {
      await closeServer(fixtureServer.server)
    }
  }
})
