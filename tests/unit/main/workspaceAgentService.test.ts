import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AgentRunRecord, MemoryWorkspaceTurnRecord, PublishApprovedPersonaDraftResult } from '../../../src/shared/archiveContracts'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createWorkspaceAgentService } from '../../../src/main/services/agents/workspaceAgentService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-workspace-agent-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function createRunRecord(): AgentRunRecord {
  return {
    runId: 'run-1',
    role: 'workspace',
    taskKind: 'workspace.ask_memory',
    status: 'running',
    prompt: 'Ask the workspace',
    confirmationToken: null,
    policyVersion: null,
    errorMessage: null,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z'
  }
}

describe('workspace agent service', () => {
  it('delegates archive-grounded questions into askMemoryWorkspacePersisted', async () => {
    const db = setupDatabase()
    const askMemoryWorkspacePersisted = vi.fn().mockReturnValue({
      turnId: 'turn-1',
      sessionId: 'session-1',
      ordinal: 1,
      question: 'What happened?',
      response: {
        scope: { kind: 'global' },
        question: 'What happened?',
        expressionMode: 'grounded',
        workflowKind: 'default',
        title: 'Memory Workspace',
        answer: {
          summary: 'Archive-backed answer.',
          displayType: 'approved_fact',
          citations: []
        },
        contextCards: [],
        guardrail: {
          decision: 'grounded_answer',
          reasonCodes: [],
          citationCount: 0,
          sourceKinds: [],
          fallbackApplied: false
        },
        boundaryRedirect: null,
        communicationEvidence: null,
        personaDraft: null
      },
      provider: null,
      model: null,
      promptHash: 'prompt-hash',
      contextHash: 'context-hash',
      createdAt: '2026-03-29T00:00:00.000Z'
    } satisfies MemoryWorkspaceTurnRecord)
    const agent = createWorkspaceAgentService({
      askMemoryWorkspacePersisted
    })

    const result = await agent.execute({
      db,
      run: createRunRecord(),
      input: {
        prompt: 'What happened?',
        role: 'workspace',
        taskKind: 'workspace.ask_memory'
      },
      taskKind: 'workspace.ask_memory',
      assignedRoles: ['workspace']
    })

    expect(askMemoryWorkspacePersisted).toHaveBeenCalledWith(db, {
      scope: { kind: 'global' },
      question: 'What happened?'
    })
    expect(result.messages?.at(-1)?.content).toContain('Archive-backed answer.')

    db.close()
  })

  it('delegates compare requests into the compare services', async () => {
    const db = setupDatabase()
    const runMemoryWorkspaceCompare = vi.fn().mockResolvedValue({
      compareSessionId: 'compare-1',
      scope: { kind: 'global' },
      title: 'Compare',
      question: 'Compare answers',
      expressionMode: 'grounded',
      workflowKind: 'default',
      runCount: 2,
      metadata: {
        targetLabels: ['Local baseline'],
        failedRunCount: 0,
        judge: {
          enabled: false,
          status: 'disabled'
        }
      },
      recommendation: null,
      createdAt: '2026-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:00:01.000Z',
      runs: []
    })
    const agent = createWorkspaceAgentService({
      runMemoryWorkspaceCompare
    })

    const result = await agent.execute({
      db,
      run: createRunRecord(),
      input: {
        prompt: 'Compare answers',
        role: 'workspace',
        taskKind: 'workspace.compare'
      },
      taskKind: 'workspace.compare',
      assignedRoles: ['workspace']
    })

    expect(runMemoryWorkspaceCompare).toHaveBeenCalledWith(db, {
      scope: { kind: 'global' },
      question: 'Compare answers'
    })
    expect(result.messages?.some((message) => message.content.includes('compare-1'))).toBe(true)

    db.close()
  })

  it('delegates publish-draft requests into the approved draft publication stack', async () => {
    const db = setupDatabase()
    const publishApprovedPersonaDraft = vi.fn().mockReturnValue({
      status: 'published',
      journalId: 'journal-1',
      publicationId: 'publication-1',
      draftReviewId: 'review-1',
      sourceTurnId: 'turn-1',
      publicationKind: 'local_share_package',
      packageRoot: '/tmp/agent-publications/approved-draft-publication-publication-1',
      manifestPath: '/tmp/agent-publications/approved-draft-publication-publication-1/manifest.json',
      publicArtifactPath: '/tmp/agent-publications/approved-draft-publication-publication-1/publication.json',
      publicArtifactFileName: 'publication.json',
      publicArtifactSha256: 'sha-1',
      displayEntryPath: '/tmp/agent-publications/approved-draft-publication-publication-1/index.html',
      displayEntryFileName: 'index.html',
      publishedAt: '2026-03-29T00:00:00.000Z'
    } satisfies PublishApprovedPersonaDraftResult)
    const agent = createWorkspaceAgentService({
      publishApprovedPersonaDraft,
      publicationRoot: '/tmp/agent-publications'
    })

    const result = await agent.execute({
      db,
      run: createRunRecord(),
      input: {
        prompt: 'Publish approved draft review-1',
        role: 'workspace',
        taskKind: 'workspace.publish_draft'
      },
      taskKind: 'workspace.publish_draft',
      assignedRoles: ['workspace']
    })

    expect(publishApprovedPersonaDraft).toHaveBeenCalledWith(db, {
      draftReviewId: 'review-1',
      destinationRoot: '/tmp/agent-publications'
    })
    expect(result.messages?.at(-1)?.content).toContain('publication-1')

    db.close()
  })
})
