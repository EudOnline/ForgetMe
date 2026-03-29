import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AgentRunRecord, DocumentEvidence, EnrichmentJob } from '../../../src/shared/archiveContracts'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createIngestionAgentService } from '../../../src/main/services/agents/ingestionAgentService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-ingestion-agent-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

function createRunRecord(): AgentRunRecord {
  return {
    runId: 'run-1',
    role: 'ingestion',
    taskKind: 'ingestion.import_batch',
    targetRole: 'ingestion',
    assignedRoles: ['ingestion'],
    latestAssistantResponse: null,
    status: 'running',
    prompt: 'Import the latest chat export',
    confirmationToken: null,
    policyVersion: null,
    errorMessage: null,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z'
  }
}

describe('ingestion agent service', () => {
  it('produces a tool plan for import-batch requests instead of touching UI', async () => {
    const db = setupDatabase()
    const createImportBatch = vi.fn()
    const agent = createIngestionAgentService({
      createImportBatch
    })

    const result = await agent.execute({
      db,
      run: createRunRecord(),
      input: {
        prompt: 'Import the latest chat export',
        role: 'ingestion',
        taskKind: 'ingestion.import_batch'
      },
      taskKind: 'ingestion.import_batch',
      assignedRoles: ['ingestion']
    })

    expect(createImportBatch).not.toHaveBeenCalled()
    expect(result.messages?.[0]?.sender).toBe('tool')
    expect(result.messages?.[0]?.content).toMatch(/plan/i)

    db.close()
  })

  it('delegates rerun-enrichment requests into the enrichment services', async () => {
    const db = setupDatabase()
    const rerunEnrichmentJob = vi.fn().mockReturnValue({
      id: 'job-2',
      fileId: 'file-1',
      fileName: 'chat.json',
      enhancerType: 'document_ocr',
      provider: 'openrouter',
      model: 'model-1',
      status: 'pending',
      attemptCount: 0,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: '2026-03-29T00:00:01.000Z',
      updatedAt: '2026-03-29T00:00:01.000Z'
    } satisfies EnrichmentJob)
    const agent = createIngestionAgentService({
      rerunEnrichmentJob
    })

    const result = await agent.execute({
      db,
      run: createRunRecord(),
      input: {
        prompt: 'Rerun enrichment job job-123',
        role: 'ingestion',
        taskKind: 'ingestion.rerun_enrichment'
      },
      taskKind: 'ingestion.rerun_enrichment',
      assignedRoles: ['ingestion']
    })

    expect(rerunEnrichmentJob).toHaveBeenCalledWith(db, { jobId: 'job-123' })
    expect(result.messages?.some((message) => message.content.includes('job-2'))).toBe(true)

    db.close()
  })

  it('reads document evidence and returns structured assistant output', async () => {
    const db = setupDatabase()
    const getDocumentEvidence = vi.fn().mockReturnValue({
      fileId: 'file-1',
      fileName: 'chat.json',
      rawText: 'Alice: hello',
      layoutBlocks: [],
      approvedFields: [],
      fieldCandidates: []
    } satisfies DocumentEvidence)
    const agent = createIngestionAgentService({
      getDocumentEvidence
    })

    const result = await agent.execute({
      db,
      run: createRunRecord(),
      input: {
        prompt: 'Summarize document evidence for file-1',
        role: 'ingestion',
        taskKind: 'ingestion.summarize_document_evidence'
      },
      taskKind: 'ingestion.summarize_document_evidence',
      assignedRoles: ['ingestion']
    })

    expect(getDocumentEvidence).toHaveBeenCalledWith(db, { fileId: 'file-1' })
    expect(result.messages?.at(-1)?.sender).toBe('agent')
    expect(result.messages?.at(-1)?.content).toContain('chat.json')

    db.close()
  })
})
