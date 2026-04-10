import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('workspace cleanup boundaries', () => {
  it('keeps workspace ipc registration free of removed person-agent compatibility channels', () => {
    const source = fs.readFileSync(
      path.resolve('src/main/modules/workspace/registerWorkspaceIpc.ts'),
      'utf8'
    )

    expect(source).not.toContain('archive:askPersonAgentConsultation')
    expect(source).not.toContain('archive:transitionPersonAgentTask')
    expect(source).not.toContain('archive:executePersonAgentTask')
    expect(source).not.toContain('archive:getPersonAgentInspectionBundle')
  })

  it('keeps boundary redirects on the current suggestedActions contract', () => {
    const source = fs.readFileSync(
      path.resolve('src/renderer/components/MemoryWorkspaceView.tsx'),
      'utf8'
    )

    expect(source).not.toContain('suggestedAsks')
  })

  it('keeps archive contracts free of the retired suggested ask alias', () => {
    const source = fs.readFileSync(
      path.resolve('src/shared/archiveContracts.ts'),
      'utf8'
    )

    expect(source).not.toContain('MemoryWorkspaceSuggestedAsk')
  })
})
