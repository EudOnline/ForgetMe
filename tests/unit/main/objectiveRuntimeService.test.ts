import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createFacilitatorAgentService } from '../../../src/main/services/agents/facilitatorAgentService'
import { createExternalVerificationBrokerService } from '../../../src/main/services/externalVerificationBrokerService'
import { createObjectiveRuntimeService } from '../../../src/main/services/objectiveRuntimeService'
import { createSubagentRegistryService } from '../../../src/main/services/subagentRegistryService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-runtime-flow-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('objective runtime service', () => {
  it('lets review raise a blocking challenge and governance veto a proposal', async () => {
    const db = setupDatabase()
    const runtime = createObjectiveRuntimeService({
      db,
      facilitator: createFacilitatorAgentService(),
      externalVerificationBroker: createExternalVerificationBrokerService({
        searchWeb: async () => [],
        openSourcePage: async ({ url }) => ({
          url,
          title: null,
          publishedAt: null,
          excerpt: ''
        })
      }),
      subagentRegistry: createSubagentRegistryService()
    })

    const started = runtime.startObjective({
      title: 'Decide whether approval is safe',
      objectiveKind: 'review_decision',
      prompt: 'Review the candidate and decide whether approval is safe.',
      initiatedBy: 'operator'
    })

    const reviewProposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'review',
      proposalKind: 'approve_review_item',
      payload: { queueItemId: 'rq-1' },
      ownerRole: 'review',
      requiresOperatorConfirmation: true
    })

    const challenged = runtime.raiseBlockingChallenge({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposalId: reviewProposal.proposalId,
      fromParticipantId: 'review',
      body: 'We still need external verification before approval.'
    })

    const vetoed = runtime.vetoProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposalId: reviewProposal.proposalId,
      rationale: 'Governance blocks approval until evidence is verified.'
    })

    expect(challenged.status).toBe('challenged')
    expect(vetoed.status).toBe('vetoed')

    db.close()
  })

  it('runs web verification inside a real subthread and returns the summary to the parent thread', async () => {
    const db = setupDatabase()
    const runtime = createObjectiveRuntimeService({
      db,
      facilitator: createFacilitatorAgentService(),
      externalVerificationBroker: createExternalVerificationBrokerService({
        searchWeb: async () => [
          {
            title: 'Official announcement result',
            url: 'https://records.example.gov/releases/announcement',
            snippet: 'The official record lists an announcement date of March 30, 2026.',
            publishedAt: null
          }
        ],
        openSourcePage: async ({ url }) => ({
          url,
          title: 'Official announcement record',
          publishedAt: '2026-03-30T00:00:00.000Z',
          excerpt: 'The announcement date is March 30, 2026. The official record was published by the agency.'
        })
      }),
      subagentRegistry: createSubagentRegistryService()
    })

    const started = runtime.startObjective({
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the external source before we answer the user.',
      initiatedBy: 'operator'
    })

    const verification = await runtime.requestExternalVerification({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      claim: 'The source confirms the announcement date.',
      query: 'official announcement date'
    })

    const reviewProposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'review',
      proposalKind: 'approve_review_item',
      payload: { queueItemId: 'rq-2' },
      ownerRole: 'review',
      requiresOperatorConfirmation: true
    })

    const latestProposal = runtime.approveProposalAsOwner({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposalId: reviewProposal.proposalId
    })
    const subthread = runtime.getThreadDetail({
      threadId: verification.subagent.threadId
    })
    const mainThread = runtime.getThreadDetail({
      threadId: started.mainThread.threadId
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })
    const toolExecutions = db.prepare(
      `select
        thread_id as threadId,
        tool_name as toolName,
        status,
        tool_policy_id as toolPolicyId
      from agent_tool_executions
      where objective_id = ?
      order by created_at asc`
    ).all(started.objective.objectiveId) as Array<{
      threadId: string
      toolName: string
      status: string
      toolPolicyId: string | null
    }>

    expect(verification.citationBundle.verdict).toBe('supported')
    expect(verification.citationBundle.sources[0]?.url).toBe('https://records.example.gov/releases/announcement')
    expect(verification.subagent.threadId).not.toBe(started.mainThread.threadId)
    expect(subthread?.threadKind).toBe('subthread')
    expect(subthread?.parentThreadId).toBe(started.mainThread.threadId)
    expect(subthread?.participants.map((participant) => participant.participantKind)).toEqual(
      expect.arrayContaining(['role', 'subagent'])
    )
    expect(subthread?.messages.map((message) => message.kind)).toEqual([
      'goal',
      'tool_result',
      'tool_result',
      'tool_result',
      'final_response'
    ])
    expect(subthread?.messages.at(-1)?.fromParticipantId).toBe(verification.subagent.subagentId)
    expect(subthread?.status).toBe('completed')
    expect(mainThread?.messages.some((message) => (
      message.kind === 'evidence_response'
      && message.fromParticipantId === verification.subagent.subagentId
    ))).toBe(true)
    expect(detail?.checkpoints.map((checkpoint) => checkpoint.checkpointKind)).toEqual(
      expect.arrayContaining([
        'goal_accepted',
        'participants_invited',
        'proposal_raised',
        'subagent_spawned',
        'external_verification_completed',
        'awaiting_operator_confirmation'
      ])
    )
    expect(latestProposal.status).toBe('awaiting_operator')
    expect(toolExecutions.map((entry) => entry.toolName)).toEqual([
      'search_web',
      'open_source_page',
      'capture_citation_bundle'
    ])
    expect(toolExecutions.every((entry) => entry.threadId === verification.subagent.threadId)).toBe(true)
    expect(toolExecutions.every((entry) => entry.status === 'completed')).toBe(true)
    expect(toolExecutions.every((entry) => entry.toolPolicyId === 'external-verification-policy')).toBe(true)
    expect(detail?.subagents[0]?.status).toBe('completed')
    expect(detail?.subagents[0]?.summary).toMatch(/supported/i)

    db.close()
  })

  it('supports proposal responses and operator confirmation through the public runtime surface', async () => {
    const db = setupDatabase()
    const runtime = createObjectiveRuntimeService({
      db,
      facilitator: createFacilitatorAgentService(),
      externalVerificationBroker: createExternalVerificationBrokerService({
        searchWeb: async () => [],
        openSourcePage: async ({ url }) => ({
          url,
          title: null,
          publishedAt: null,
          excerpt: ''
        })
      }),
      subagentRegistry: createSubagentRegistryService()
    })

    const started = runtime.startObjective({
      title: 'Decide whether approval is safe',
      objectiveKind: 'review_decision',
      prompt: 'Review the candidate and decide whether approval is safe.',
      initiatedBy: 'operator'
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'review',
      proposalKind: 'approve_review_item',
      payload: { queueItemId: 'rq-3' },
      ownerRole: 'review',
      requiresOperatorConfirmation: true
    })

    const approved = await runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'review',
      response: 'approve',
      comment: 'Owner approved this review action.'
    })
    const confirmed = await runtime.confirmAgentProposal({
      proposalId: proposal.proposalId,
      decision: 'confirm',
      operatorNote: 'Confirmed after reviewing the proposal summary.'
    })

    expect(approved?.status).toBe('awaiting_operator')
    expect(confirmed?.status).toBe('committed')

    const blockedProposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'review',
      proposalKind: 'reject_review_item',
      payload: { queueItemId: 'rq-4' },
      ownerRole: 'review',
      requiresOperatorConfirmation: true
    })
    const blocked = await runtime.confirmAgentProposal({
      proposalId: blockedProposal.proposalId,
      decision: 'block',
      operatorNote: 'Blocked pending additional evidence.'
    })
    const detail = runtime.getThreadDetail({
      threadId: started.mainThread.threadId
    })

    expect(blocked?.status).toBe('blocked')
    expect(detail?.proposals.map((candidate) => candidate.status)).toEqual(
      expect.arrayContaining(['committed', 'blocked'])
    )

    db.close()
  })

  it('executes committed spawn_subagent proposals through the specialization runner', async () => {
    const db = setupDatabase()
    const runtime = createObjectiveRuntimeService({
      db,
      facilitator: createFacilitatorAgentService(),
      externalVerificationBroker: createExternalVerificationBrokerService({
        searchWeb: async () => [
          {
            title: 'Official announcement result',
            url: 'https://records.example.gov/releases/announcement',
            snippet: 'The official record lists an announcement date of March 30, 2026.',
            publishedAt: null
          }
        ],
        openSourcePage: async ({ url }) => ({
          url,
          title: 'Official announcement record',
          publishedAt: '2026-03-30T00:00:00.000Z',
          excerpt: 'The announcement date is March 30, 2026. The official record was published by the agency.'
        })
      }),
      subagentRegistry: createSubagentRegistryService()
    })

    const started = runtime.startObjective({
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the external source before we answer the user.',
      initiatedBy: 'operator'
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'spawn_subagent',
      payload: {
        specialization: 'web-verifier',
        skillPackIds: ['web-verifier'],
        expectedOutputSchema: 'webVerificationResultSchema',
        claim: 'The source confirms the announcement date.',
        query: 'official announcement date'
      },
      ownerRole: 'workspace',
      requiresOperatorConfirmation: true,
      toolPolicyId: 'external-verification-policy',
      budget: {
        maxRounds: 2,
        maxToolCalls: 3,
        timeoutMs: 30_000
      }
    })

    const approved = await runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'workspace',
      response: 'approve',
      comment: 'Owner approved bounded subagent execution.'
    })
    const confirmed = await runtime.confirmAgentProposal({
      proposalId: proposal.proposalId,
      decision: 'confirm',
      operatorNote: 'Confirmed after reviewing the subagent scope.'
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })

    expect(approved?.status).toBe('awaiting_operator')
    expect(confirmed?.status).toBe('committed')
    expect(detail?.subagents).toHaveLength(1)
    expect(detail?.subagents[0]?.specialization).toBe('web-verifier')
    expect(detail?.subagents[0]?.status).toBe('completed')

    const subthread = runtime.getThreadDetail({
      threadId: detail?.subagents[0]?.threadId ?? ''
    })
    const mainThread = runtime.getThreadDetail({
      threadId: started.mainThread.threadId
    })

    expect(subthread?.threadKind).toBe('subthread')
    expect(subthread?.messages.map((message) => message.kind)).toEqual([
      'goal',
      'tool_result',
      'tool_result',
      'tool_result',
      'final_response'
    ])
    expect(mainThread?.messages.some((message) => (
      message.kind === 'evidence_response'
      && message.fromParticipantId === detail?.subagents[0]?.subagentId
    ))).toBe(true)

    db.close()
  })

  it('executes committed evidence-checker subagents through the specialization runner', async () => {
    const db = setupDatabase()
    const createdAt = '2026-03-30T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'evidence-checker', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/id-card.jpg', '/tmp/id-card.jpg', 'id-card.jpg', '.jpg', 'image/jpeg', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run('ea-1', 'job-1', 'ocr_raw_text', '{"rawText":"姓名 张三 证件号 123456"}', createdAt)
    db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run('ea-2', 'job-1', 'ocr_layout_blocks', '{"layoutBlocks":[{"page":1,"text":"姓名 张三"},{"page":1,"text":"证件号 123456"}]}', createdAt)
    db.prepare(`insert into structured_field_candidates (
      id, file_id, job_id, field_type, field_key, field_value_json, document_type,
      confidence, risk_level, source_page, source_span_json, status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('fc-1', 'f-1', 'job-1', 'identity', 'national_id_number', '{"value":"123456"}', 'id_card', 0.98, 'high', 1, null, 'pending', createdAt)
    db.prepare(`insert into enriched_evidence (
      id, file_id, job_id, evidence_type, payload_json, risk_level, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('ee-1', 'f-1', 'job-1', 'approved_structured_field', '{"fieldType":"identity","fieldKey":"full_name","fieldValue":{"value":"张三"},"documentType":"id_card"}', 'high', 'approved', createdAt, createdAt)

    const runtime = createObjectiveRuntimeService({
      db,
      facilitator: createFacilitatorAgentService(),
      externalVerificationBroker: createExternalVerificationBrokerService({
        searchWeb: async () => [],
        openSourcePage: async ({ url }) => ({
          url,
          title: null,
          publishedAt: null,
          excerpt: ''
        })
      }),
      subagentRegistry: createSubagentRegistryService()
    })

    const started = runtime.startObjective({
      title: 'Check local OCR evidence before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Review the local OCR evidence and report the confidence gaps.',
      initiatedBy: 'operator'
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'spawn_subagent',
      payload: {
        specialization: 'evidence-checker',
        skillPackIds: ['evidence-checker'],
        expectedOutputSchema: 'localEvidenceCheckSchema',
        fileId: 'f-1'
      },
      ownerRole: 'workspace',
      requiresOperatorConfirmation: true,
      toolPolicyId: 'local-evidence-policy',
      budget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    })

    const approved = await runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'workspace',
      response: 'approve',
      comment: 'Owner approved bounded local evidence checking.'
    })
    const confirmed = await runtime.confirmAgentProposal({
      proposalId: proposal.proposalId,
      decision: 'confirm',
      operatorNote: 'Confirmed after reviewing the local evidence scope.'
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })
    const subthread = runtime.getThreadDetail({
      threadId: detail?.subagents[0]?.threadId ?? ''
    })
    const mainThread = runtime.getThreadDetail({
      threadId: started.mainThread.threadId
    })
    const toolExecutions = db.prepare(
      `select
        thread_id as threadId,
        tool_name as toolName,
        status,
        tool_policy_id as toolPolicyId
      from agent_tool_executions
      where objective_id = ?
      order by created_at asc`
    ).all(started.objective.objectiveId) as Array<{
      threadId: string
      toolName: string
      status: string
      toolPolicyId: string | null
    }>

    expect(approved?.status).toBe('awaiting_operator')
    expect(confirmed?.status).toBe('committed')
    expect(detail?.subagents).toHaveLength(1)
    expect(detail?.subagents[0]?.specialization).toBe('evidence-checker')
    expect(detail?.subagents[0]?.status).toBe('completed')
    expect(subthread?.threadKind).toBe('subthread')
    expect(subthread?.messages.map((message) => message.kind)).toEqual([
      'goal',
      'tool_result',
      'final_response'
    ])
    expect(mainThread?.messages.some((message) => (
      message.kind === 'evidence_response'
      && message.fromParticipantId === detail?.subagents[0]?.subagentId
      && /approved fields/i.test(message.body)
    ))).toBe(true)
    expect(toolExecutions).toEqual([
      expect.objectContaining({
        threadId: detail?.subagents[0]?.threadId,
        toolName: 'get_document_evidence',
        status: 'completed',
        toolPolicyId: 'local-evidence-policy'
      })
    ])

    db.close()
  })

  it('auto-commits and executes spawn_subagent proposals that do not require operator confirmation', async () => {
    const db = setupDatabase()
    const createdAt = '2026-03-30T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'auto-commit-subagent', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/passport.jpg', '/tmp/passport.jpg', 'passport.jpg', '.jpg', 'image/jpeg', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run('ea-1', 'job-1', 'ocr_raw_text', '{"rawText":"姓名 李四 护照号 A12345678"}', createdAt)
    db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run('ea-2', 'job-1', 'ocr_layout_blocks', '{"layoutBlocks":[{"page":1,"text":"姓名 李四"},{"page":1,"text":"护照号 A12345678"}]}', createdAt)

    const runtime = createObjectiveRuntimeService({
      db,
      facilitator: createFacilitatorAgentService(),
      externalVerificationBroker: createExternalVerificationBrokerService({
        searchWeb: async () => [],
        openSourcePage: async ({ url }) => ({
          url,
          title: null,
          publishedAt: null,
          excerpt: ''
        })
      }),
      subagentRegistry: createSubagentRegistryService()
    })

    const started = runtime.startObjective({
      title: 'Auto-run bounded local evidence checks',
      objectiveKind: 'evidence_investigation',
      prompt: 'Allow bounded subagent execution once the owner approves.',
      initiatedBy: 'operator'
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'spawn_subagent',
      payload: {
        specialization: 'evidence-checker',
        skillPackIds: ['evidence-checker'],
        expectedOutputSchema: 'localEvidenceCheckSchema',
        fileId: 'f-1'
      },
      ownerRole: 'workspace',
      requiresOperatorConfirmation: false,
      toolPolicyId: 'local-evidence-policy',
      budget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    })

    const approved = await runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'workspace',
      response: 'approve',
      comment: 'Owner approved immediate bounded execution.'
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })
    const subthread = runtime.getThreadDetail({
      threadId: detail?.subagents[0]?.threadId ?? ''
    })
    const mainThread = runtime.getThreadDetail({
      threadId: started.mainThread.threadId
    })

    expect(approved?.status).toBe('committed')
    expect(detail?.subagents).toHaveLength(1)
    expect(detail?.subagents[0]?.specialization).toBe('evidence-checker')
    expect(detail?.subagents[0]?.status).toBe('completed')
    expect(subthread?.messages.map((message) => message.kind)).toEqual([
      'goal',
      'tool_result',
      'final_response'
    ])
    expect(mainThread?.messages.some((message) => (
      message.kind === 'evidence_response'
      && message.fromParticipantId === detail?.subagents[0]?.subagentId
    ))).toBe(true)

    db.close()
  })

  it('includes the requesting subagent in nested child subthreads and records the goal as agent-to-agent', async () => {
    const db = setupDatabase()
    const createdAt = '2026-03-30T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'nested-subagent', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/license.jpg', '/tmp/license.jpg', 'license.jpg', '.jpg', 'image/jpeg', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run('ea-1', 'job-1', 'ocr_raw_text', '{"rawText":"姓名 王五 驾驶证号 B998877"}', createdAt)
    db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run('ea-2', 'job-1', 'ocr_layout_blocks', '{"layoutBlocks":[{"page":1,"text":"姓名 王五"},{"page":1,"text":"驾驶证号 B998877"}]}', createdAt)

    const runtime = createObjectiveRuntimeService({
      db,
      facilitator: createFacilitatorAgentService(),
      externalVerificationBroker: createExternalVerificationBrokerService({
        searchWeb: async () => [],
        openSourcePage: async ({ url }) => ({
          url,
          title: null,
          publishedAt: null,
          excerpt: ''
        })
      }),
      subagentRegistry: createSubagentRegistryService()
    })

    const started = runtime.startObjective({
      title: 'Let a subagent delegate bounded local evidence work',
      objectiveKind: 'evidence_investigation',
      prompt: 'Allow a subagent to delegate a bounded follow-up evidence check.',
      initiatedBy: 'operator'
    })

    const parentProposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'spawn_subagent',
      payload: {
        specialization: 'evidence-checker',
        skillPackIds: ['evidence-checker'],
        expectedOutputSchema: 'localEvidenceCheckSchema',
        fileId: 'f-1'
      },
      ownerRole: 'workspace',
      requiresOperatorConfirmation: false,
      toolPolicyId: 'local-evidence-policy',
      budget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    })

    await runtime.respondToAgentProposal({
      proposalId: parentProposal.proposalId,
      responderRole: 'workspace',
      response: 'approve',
      comment: 'Owner approved the parent bounded subagent.'
    })

    const parentObjectiveDetail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })
    const parentSubagent = parentObjectiveDetail?.subagents[0]

    expect(parentSubagent).toBeDefined()

    const childProposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: parentSubagent?.threadId ?? '',
      proposedByParticipantId: parentSubagent?.subagentId ?? '',
      proposalKind: 'spawn_subagent',
      payload: {
        specialization: 'evidence-checker',
        skillPackIds: ['evidence-checker'],
        expectedOutputSchema: 'localEvidenceCheckSchema',
        fileId: 'f-1'
      },
      ownerRole: 'workspace',
      requiresOperatorConfirmation: false,
      toolPolicyId: 'local-evidence-policy',
      budget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    })

    const childApproved = await runtime.respondToAgentProposal({
      proposalId: childProposal.proposalId,
      responderRole: 'workspace',
      response: 'approve',
      comment: 'Owner approved the child bounded subagent.'
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })
    const childSubagent = detail?.subagents.find((candidate) => (
      candidate.subagentId !== parentSubagent?.subagentId
      && candidate.parentThreadId === parentSubagent?.threadId
    ))
    const childSubthread = runtime.getThreadDetail({
      threadId: childSubagent?.threadId ?? ''
    })
    const parentSubthread = runtime.getThreadDetail({
      threadId: parentSubagent?.threadId ?? ''
    })

    expect(childApproved?.status).toBe('committed')
    expect(childSubagent?.status).toBe('completed')
    expect(childSubthread?.parentThreadId).toBe(parentSubagent?.threadId)
    expect(childSubthread?.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        participantKind: 'subagent',
        participantId: parentSubagent?.subagentId
      }),
      expect.objectContaining({
        participantKind: 'subagent',
        participantId: childSubagent?.subagentId
      })
    ]))
    expect(childSubthread?.messages[0]?.kind).toBe('goal')
    expect(childSubthread?.messages[0]?.fromParticipantId).toBe(parentSubagent?.subagentId)
    expect(parentSubthread?.messages.some((message) => (
      message.kind === 'evidence_response'
      && message.fromParticipantId === childSubagent?.subagentId
    ))).toBe(true)

    db.close()
  })

  it('lets a running web-verifier delegate a nested evidence-checker and continue after the child response', async () => {
    const db = setupDatabase()
    const createdAt = '2026-03-30T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'hybrid-delegation', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/notice.jpg', '/tmp/notice.jpg', 'notice.jpg', '.jpg', 'image/jpeg', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run('ea-1', 'job-1', 'ocr_raw_text', '{"rawText":"本地公告写明日期 2026-03-30"}', createdAt)
    db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run('ea-2', 'job-1', 'ocr_layout_blocks', '{"layoutBlocks":[{"page":1,"text":"本地公告写明日期 2026-03-30"}]}', createdAt)

    const runtime = createObjectiveRuntimeService({
      db,
      facilitator: createFacilitatorAgentService(),
      externalVerificationBroker: createExternalVerificationBrokerService({
        searchWeb: async () => [
          {
            title: 'Official announcement result',
            url: 'https://records.example.gov/releases/announcement',
            snippet: 'The official record lists an announcement date of March 30, 2026.',
            publishedAt: null
          }
        ],
        openSourcePage: async ({ url }) => ({
          url,
          title: 'Official announcement record',
          publishedAt: '2026-03-30T00:00:00.000Z',
          excerpt: 'The official record confirms March 30, 2026 as the announcement date.'
        })
      }),
      subagentRegistry: createSubagentRegistryService()
    })

    const started = runtime.startObjective({
      title: 'Blend external verification with local evidence',
      objectiveKind: 'evidence_investigation',
      prompt: 'Verify the external claim and let the verifier delegate a local evidence cross-check.',
      initiatedBy: 'operator'
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'spawn_subagent',
      payload: {
        specialization: 'web-verifier',
        skillPackIds: ['web-verifier'],
        expectedOutputSchema: 'webVerificationResultSchema',
        claim: 'The source confirms the announcement date.',
        query: 'official announcement date',
        localEvidenceFileId: 'f-1'
      },
      ownerRole: 'workspace',
      requiresOperatorConfirmation: false,
      toolPolicyId: 'external-verification-policy',
      budget: {
        maxRounds: 2,
        maxToolCalls: 3,
        timeoutMs: 30_000
      }
    })

    const approved = await runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'workspace',
      response: 'approve',
      comment: 'Owner approved hybrid delegated verification.'
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })
    const parentSubagent = detail?.subagents.find((candidate) => candidate.specialization === 'web-verifier')
    const childSubagent = detail?.subagents.find((candidate) => candidate.specialization === 'evidence-checker')
    const parentThread = runtime.getThreadDetail({
      threadId: parentSubagent?.threadId ?? ''
    })
    const childThread = runtime.getThreadDetail({
      threadId: childSubagent?.threadId ?? ''
    })

    const childEvidenceIndex = parentThread?.messages.findIndex((message) => (
      message.kind === 'evidence_response'
      && message.fromParticipantId === childSubagent?.subagentId
    )) ?? -1
    const parentFinalIndex = parentThread?.messages.findIndex((message) => (
      message.kind === 'final_response'
      && message.fromParticipantId === parentSubagent?.subagentId
    )) ?? -1

    expect(approved?.status).toBe('committed')
    expect(parentSubagent?.status).toBe('completed')
    expect(childSubagent?.status).toBe('completed')
    expect(childSubagent?.parentThreadId).toBe(parentSubagent?.threadId)
    expect(parentThread?.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        proposalKind: 'spawn_subagent',
        proposedByParticipantId: parentSubagent?.subagentId,
        status: 'committed'
      })
    ]))
    expect(parentThread?.messages.some((message) => (
      message.kind === 'decision'
      && message.fromParticipantId === parentSubagent?.subagentId
      && /nested delegation requested: evidence-checker/i.test(message.body)
    ))).toBe(true)
    expect(parentThread?.messages.some((message) => (
      message.kind === 'tool_result'
      && message.fromParticipantId === parentSubagent?.subagentId
      && /nested delegation completed: evidence-checker/i.test(message.body)
    ))).toBe(true)
    expect(childEvidenceIndex).toBeGreaterThan(-1)
    expect(parentFinalIndex).toBeGreaterThan(childEvidenceIndex)
    expect(parentThread?.messages.at(parentFinalIndex)?.body).toMatch(/local evidence/i)
    expect(childThread?.parentThreadId).toBe(parentSubagent?.threadId)

    db.close()
  })

  it('lets a running evidence-checker delegate a nested web-verifier and continue after the child response', async () => {
    const db = setupDatabase()
    const createdAt = '2026-03-30T00:00:00.000Z'

    db.prepare('insert into import_batches (id, source_label, status, created_at) values (?, ?, ?, ?)').run('b-1', 'reverse-hybrid-delegation', 'ready', createdAt)
    db.prepare('insert into vault_files (id, batch_id, source_path, frozen_path, file_name, extension, mime_type, file_size, sha256, duplicate_class, parser_status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f-1', 'b-1', '/tmp/local-record.jpg', '/tmp/local-record.jpg', 'local-record.jpg', '.jpg', 'image/jpeg', 1, 'hash-1', 'unique', 'parsed', createdAt)
    db.prepare(`insert into enrichment_jobs (
      id, file_id, enhancer_type, provider, model, status, attempt_count, input_hash,
      started_at, finished_at, error_message, usage_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('job-1', 'f-1', 'document_ocr', 'siliconflow', 'model-a', 'completed', 1, null, createdAt, createdAt, null, '{}', createdAt, createdAt)
    db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run('ea-1', 'job-1', 'ocr_raw_text', '{"rawText":"本地记录注明日期 2026-03-30"}', createdAt)
    db.prepare('insert into enrichment_artifacts (id, job_id, artifact_type, payload_json, created_at) values (?, ?, ?, ?, ?)').run('ea-2', 'job-1', 'ocr_layout_blocks', '{"layoutBlocks":[{"page":1,"text":"本地记录注明日期 2026-03-30"}]}', createdAt)

    const runtime = createObjectiveRuntimeService({
      db,
      facilitator: createFacilitatorAgentService(),
      externalVerificationBroker: createExternalVerificationBrokerService({
        searchWeb: async () => [
          {
            title: 'Official announcement result',
            url: 'https://records.example.gov/releases/announcement',
            snippet: 'The official record lists an announcement date of March 30, 2026.',
            publishedAt: null
          }
        ],
        openSourcePage: async ({ url }) => ({
          url,
          title: 'Official announcement record',
          publishedAt: '2026-03-30T00:00:00.000Z',
          excerpt: 'The official record confirms March 30, 2026 as the announcement date.'
        })
      }),
      subagentRegistry: createSubagentRegistryService()
    })

    const started = runtime.startObjective({
      title: 'Blend local evidence with external cross-check',
      objectiveKind: 'evidence_investigation',
      prompt: 'Let the evidence checker delegate an external cross-check before finalizing.',
      initiatedBy: 'operator'
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'spawn_subagent',
      payload: {
        specialization: 'evidence-checker',
        skillPackIds: ['evidence-checker'],
        expectedOutputSchema: 'localEvidenceCheckSchema',
        fileId: 'f-1',
        crossCheckClaim: 'The source confirms the announcement date.',
        crossCheckQuery: 'official announcement date'
      },
      ownerRole: 'workspace',
      requiresOperatorConfirmation: false,
      toolPolicyId: 'local-evidence-policy',
      budget: {
        maxRounds: 2,
        maxToolCalls: 2,
        timeoutMs: 30_000
      }
    })

    const approved = await runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'workspace',
      response: 'approve',
      comment: 'Owner approved hybrid local-plus-external checking.'
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })
    const parentSubagent = detail?.subagents.find((candidate) => candidate.specialization === 'evidence-checker')
    const childSubagent = detail?.subagents.find((candidate) => candidate.specialization === 'web-verifier')
    const parentThread = runtime.getThreadDetail({
      threadId: parentSubagent?.threadId ?? ''
    })
    const childThread = runtime.getThreadDetail({
      threadId: childSubagent?.threadId ?? ''
    })

    const childEvidenceIndex = parentThread?.messages.findIndex((message) => (
      message.kind === 'evidence_response'
      && message.fromParticipantId === childSubagent?.subagentId
    )) ?? -1
    const parentFinalIndex = parentThread?.messages.findIndex((message) => (
      message.kind === 'final_response'
      && message.fromParticipantId === parentSubagent?.subagentId
    )) ?? -1

    expect(approved?.status).toBe('committed')
    expect(parentSubagent?.status).toBe('completed')
    expect(childSubagent?.status).toBe('completed')
    expect(childSubagent?.parentThreadId).toBe(parentSubagent?.threadId)
    expect(parentThread?.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        proposalKind: 'spawn_subagent',
        proposedByParticipantId: parentSubagent?.subagentId,
        status: 'committed'
      })
    ]))
    expect(parentThread?.messages.some((message) => (
      message.kind === 'decision'
      && message.fromParticipantId === parentSubagent?.subagentId
      && /nested delegation requested: web-verifier/i.test(message.body)
    ))).toBe(true)
    expect(parentThread?.messages.some((message) => (
      message.kind === 'tool_result'
      && message.fromParticipantId === parentSubagent?.subagentId
      && /nested delegation completed: web-verifier/i.test(message.body)
    ))).toBe(true)
    expect(childEvidenceIndex).toBeGreaterThan(-1)
    expect(parentFinalIndex).toBeGreaterThan(childEvidenceIndex)
    expect(parentThread?.messages.at(parentFinalIndex)?.body).toMatch(/external verification/i)
    expect(childThread?.parentThreadId).toBe(parentSubagent?.threadId)

    db.close()
  })
})
