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

  it('keeps archive contracts free of unused agent task kind aliases', () => {
    const source = fs.readFileSync(
      path.resolve('src/shared/archiveContracts.ts'),
      'utf8'
    )

    expect(source).not.toContain('export type AgentTaskKindByRole')
    expect(source).not.toContain('export type AgentTaskKind =')
  })

  it('keeps archive contracts free of leaf aliases that are only internally forwarded', () => {
    const source = fs.readFileSync(
      path.resolve('src/shared/archiveContracts.ts'),
      'utf8'
    )

    expect(source).not.toContain('export type ApprovedDraftPublicationKind')
    expect(source).not.toContain('export type MemoryWorkspaceCompareRunStatus')
    expect(source).not.toContain('export type MemoryWorkspaceCompareEvaluationDimensionKey')
    expect(source).not.toContain('export type ImportPreflightSummary')
  })

  it('keeps archive api person-agent signatures free of forwarded input and result aliases', () => {
    const source = fs.readFileSync(
      path.resolve('src/shared/archiveContracts.ts'),
      'utf8'
    )

    expect(source).not.toContain('export type GetPersonAgentStateInput')
    expect(source).not.toContain('export type GetPersonAgentCapsuleInput')
    expect(source).not.toContain('export type ListPersonAgentCapsuleMemoryCheckpointsInput')
    expect(source).not.toContain('export type GetPersonAgentMemorySummaryInput')
    expect(source).not.toContain('export type GetPersonAgentCapsuleRuntimeInspectionInput')
    expect(source).not.toContain('export type ListPersonAgentConsultationSessionsInput')
    expect(source).not.toContain('export type GetPersonAgentConsultationSessionInput')
    expect(source).not.toContain('export type GetPersonAgentRuntimeStateInput')
    expect(source).not.toContain('export type ListPersonAgentAuditEventsInput')
    expect(source).not.toContain('export type ListPersonAgentTasksInput')
    expect(source).not.toContain('export type SafeReviewGroupApprovalResult')
  })
})
