import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createFacilitatorAgentService } from '../../../src/main/services/agents/facilitatorAgentService'
import { createRoleAgentRegistryService } from '../../../src/main/services/agents/roleAgentRegistryService'
import { createExternalVerificationBrokerService } from '../../../src/main/services/externalVerificationBrokerService'
import { createObjectiveRuntimeService } from '../../../src/main/services/objectiveRuntimeService'
import {
  buildObjectiveSuggestionSeed,
  createObjectiveFromSuggestionSeed
} from '../../../src/main/services/objectiveSuggestionBridgeService'
import { createSubagentRegistryService } from '../../../src/main/services/subagentRegistryService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-runtime-flow-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('objective runtime service', () => {
  it('can deliberate a thread with role agents and auto-runs the first deliberation during objective startup', async () => {
    const db = setupDatabase()
    const roleAgentRegistry = {
      get(role: string) {
        if (role === 'workspace') {
          return {
            role: 'workspace',
            canHandle() {
              return true
            },
            async execute() {
              return {
                messages: []
              }
            },
            async receive() {
              return {
                messages: [],
                proposals: [
                  {
                    proposalKind: 'verify_external_claim' as const,
                    payload: {
                      claim: 'The source confirms the announcement date.',
                      query: 'official announcement date'
                    },
                    ownerRole: 'workspace' as const,
                    requiredApprovals: ['workspace' as const],
                    allowVetoBy: ['governance' as const],
                    toolPolicyId: 'external-verification-policy',
                    budget: {
                      maxRounds: 2,
                      maxToolCalls: 3,
                      timeoutMs: 30_000
                    }
                  }
                ]
              }
            }
          }
        }

        if (role === 'review') {
          return {
            role: 'review',
            canHandle() {
              return true
            },
            async execute() {
              return {
                messages: []
              }
            },
            async receive() {
              return {
                messages: [
                  {
                    kind: 'challenge' as const,
                    body: 'Review needs stronger evidence before approval.',
                    blocking: true
                  }
                ]
              }
            }
          }
        }

        return null
      }
    }

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
      subagentRegistry: createSubagentRegistryService(),
      roleAgentRegistry
    } as any)

    const started = await runtime.startObjective({
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the external source before we answer the user.',
      initiatedBy: 'operator'
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })
    const mainThread = runtime.getThreadDetail({
      threadId: started.mainThread.threadId
    })

    expect(detail?.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        proposalKind: 'verify_external_claim',
        proposedByParticipantId: 'workspace'
      })
    ]))
    expect(mainThread?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'challenge',
        fromParticipantId: 'review',
        body: 'Review needs stronger evidence before approval.'
      })
    ]))

    const rerun = await (runtime as any).deliberateThread({
      threadId: started.mainThread.threadId
    })

    expect(rerun.thread.messages.length).toBeGreaterThanOrEqual(mainThread?.messages.length ?? 0)

    db.close()
  })

  it('persists runtime-generated workspace and ingestion proposals during startup deliberation', async () => {
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
      subagentRegistry: createSubagentRegistryService(),
      roleAgentRegistry: createRoleAgentRegistryService()
    })

    const started = await runtime.startObjective({
      title: 'Investigate local and external evidence together',
      objectiveKind: 'evidence_investigation',
      prompt: 'Review local evidence in file-evidence-1 and verify the public claim before responding.',
      initiatedBy: 'operator'
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })

    expect(detail?.participants.some((participant) => participant.role === 'ingestion')).toBe(true)
    expect(detail?.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        proposalKind: 'verify_external_claim',
        proposedByParticipantId: 'workspace'
      }),
      expect.objectContaining({
        proposalKind: 'spawn_subagent',
        proposedByParticipantId: 'ingestion',
        payload: expect.objectContaining({
          specialization: 'evidence-checker',
          fileId: 'file-evidence-1'
        })
      })
    ]))

    db.close()
  })

  it('creates an objective plus a seeded proposal from a proactive bridge seed', async () => {
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

    const seed = buildObjectiveSuggestionSeed({
      triggerKind: 'review.safe_group_available',
      dedupeKey: 'review.safe-group::group-safe-42::follow-up::suggestion-1',
      sourceRunId: 'run-safe-group-followup',
      taskInput: {
        role: 'review',
        taskKind: 'review.apply_safe_group',
        prompt: 'Apply safe group group-safe-42.'
      },
      rationale: 'The safe group recommendation is ready to apply manually.',
      autoRunnable: false
    })

    const detail = await createObjectiveFromSuggestionSeed(runtime, seed)

    expect(detail).toEqual(expect.objectContaining({
      objectiveKind: 'review_decision'
    }))
    expect((detail as any)?.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        proposalKind: 'approve_safe_group',
        payload: {
          groupKey: 'group-safe-42'
        }
      })
    ]))

    db.close()
  })

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

    const started = await runtime.startObjective({
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

    const started = await runtime.startObjective({
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

    const started = await runtime.startObjective({
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

    const started = await runtime.startObjective({
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

    const started = await runtime.startObjective({
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

    const started = await runtime.startObjective({
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

  it('executes committed compare-analyst proposals through the specialization runner', async () => {
    const db = setupDatabase()
    const runMemoryWorkspaceCompare = async () => ({
      compareSessionId: 'compare-session-1',
      scope: { kind: 'global' as const },
      title: 'Memory Workspace Compare',
      question: 'Compare grounded answer candidates for this request.',
      expressionMode: 'grounded' as const,
      workflowKind: 'default' as const,
      runCount: 2,
      metadata: {
        completedRunCount: 2,
        failedRunCount: 0,
        judgeStatus: 'ready' as const
      },
      recommendation: {
        status: 'ready' as const,
        recommendedCompareRunId: 'compare-run-local',
        reason: 'The baseline answer stayed the most grounded.'
      },
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:10.000Z',
      runs: [
        {
          compareRunId: 'compare-run-local',
          compareSessionId: 'compare-session-1',
          ordinal: 1,
          targetId: 'local-baseline',
          targetLabel: 'Local baseline',
          executionMode: 'local_baseline' as const,
          provider: null,
          model: null,
          status: 'completed' as const,
          errorMessage: null,
          response: null,
          evaluation: null,
          judgeVerdict: null,
          promptHash: 'prompt-hash-1',
          contextHash: 'context-hash-1',
          createdAt: '2026-03-30T00:00:00.000Z'
        },
        {
          compareRunId: 'compare-run-remote',
          compareSessionId: 'compare-session-1',
          ordinal: 2,
          targetId: 'remote-model',
          targetLabel: 'Remote model',
          executionMode: 'provider_compare' as const,
          provider: 'test-provider',
          model: 'test-model',
          status: 'completed' as const,
          errorMessage: null,
          response: null,
          evaluation: null,
          judgeVerdict: null,
          promptHash: 'prompt-hash-2',
          contextHash: 'context-hash-2',
          createdAt: '2026-03-30T00:00:05.000Z'
        }
      ]
    })
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
      subagentRegistry: createSubagentRegistryService(),
      runMemoryWorkspaceCompare
    } as any)

    const started = await runtime.startObjective({
      title: 'Compare grounded answer candidates',
      objectiveKind: 'user_response',
      prompt: 'Compare grounded answer candidates for this request.',
      initiatedBy: 'operator'
    })
    const compareSpec = createSubagentRegistryService().buildSpawnSubagentSpec({
      specialization: 'compare-analyst',
      payload: {
        question: 'Compare grounded answer candidates for this request.'
      }
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'spawn_subagent',
      payload: compareSpec.payload,
      ownerRole: 'workspace',
      requiresOperatorConfirmation: false,
      toolPolicyId: compareSpec.toolPolicyId,
      budget: compareSpec.budget
    })

    const approved = await runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'workspace',
      response: 'approve',
      comment: 'Owner approved bounded compare analysis.'
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })
    const subagent = detail?.subagents.find((candidate) => candidate.specialization === 'compare-analyst')
    const subthread = runtime.getThreadDetail({
      threadId: subagent?.threadId ?? ''
    })
    const toolExecutions = db.prepare(
      `select tool_name as toolName, status
       from agent_tool_executions
       where objective_id = ?
       order by created_at asc`
    ).all(started.objective.objectiveId) as Array<{ toolName: string; status: string }>

    expect(approved?.status).toBe('committed')
    expect(subagent?.status).toBe('completed')
    expect(subthread?.messages.map((message) => message.kind)).toEqual([
      'goal',
      'tool_result',
      'tool_result',
      'final_response'
    ])
    expect(subthread?.messages.at(-1)?.body).toMatch(/compare session compare-session-1/i)
    expect(toolExecutions).toEqual([
      { toolName: 'run_compare', status: 'completed' },
      { toolName: 'summarize_compare_results', status: 'completed' }
    ])

    db.close()
  })

  it('executes committed draft-composer proposals through the specialization runner', async () => {
    const db = setupDatabase()
    const askMemoryWorkspacePersisted = () => ({
      turnId: 'turn-1',
      sessionId: 'session-1',
      ordinal: 1,
      question: 'Draft a review-ready response from the archive.',
      response: {
        title: 'Memory Workspace Draft',
        answer: {
          summary: 'Draft summary'
        },
        workflowKind: 'persona_draft_sandbox',
        expressionMode: 'grounded',
        supportingExcerptCount: 2,
        reasonCodes: ['persona_draft_sandbox'],
        personaDraft: {
          draft: 'Reviewed simulation draft based on the archive.',
          trace: [],
          reviewStatus: 'review_required'
        }
      },
      provider: null,
      model: null,
      promptHash: 'prompt-hash-1',
      contextHash: 'context-hash-1',
      createdAt: '2026-03-30T00:00:00.000Z'
    })
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
      subagentRegistry: createSubagentRegistryService(),
      askMemoryWorkspacePersisted
    } as any)

    const started = await runtime.startObjective({
      title: 'Prepare a reviewed draft',
      objectiveKind: 'user_response',
      prompt: 'Draft a review-ready response from the archive.',
      initiatedBy: 'operator'
    })
    const draftSpec = createSubagentRegistryService().buildSpawnSubagentSpec({
      specialization: 'draft-composer',
      payload: {
        question: 'Draft a review-ready response from the archive.'
      }
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'spawn_subagent',
      payload: draftSpec.payload,
      ownerRole: 'workspace',
      requiresOperatorConfirmation: false,
      toolPolicyId: draftSpec.toolPolicyId,
      budget: draftSpec.budget
    })

    const approved = await runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'workspace',
      response: 'approve',
      comment: 'Owner approved bounded draft composition.'
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })
    const subagent = detail?.subagents.find((candidate) => candidate.specialization === 'draft-composer')
    const subthread = runtime.getThreadDetail({
      threadId: subagent?.threadId ?? ''
    })
    const toolExecutions = db.prepare(
      `select tool_name as toolName, status
       from agent_tool_executions
       where objective_id = ?
       order by created_at asc`
    ).all(started.objective.objectiveId) as Array<{ toolName: string; status: string }>

    expect(approved?.status).toBe('committed')
    expect(subagent?.status).toBe('completed')
    expect(subthread?.messages.map((message) => message.kind)).toEqual([
      'goal',
      'tool_result',
      'tool_result',
      'final_response'
    ])
    expect(subthread?.messages.at(-1)?.body).toMatch(/reviewed simulation draft/i)
    expect(toolExecutions).toEqual([
      { toolName: 'ask_memory_workspace', status: 'completed' },
      { toolName: 'compose_reviewed_draft', status: 'completed' }
    ])

    db.close()
  })

  it('executes committed policy-auditor proposals through the specialization runner', async () => {
    const db = setupDatabase()
    db.prepare(
      `insert into agent_policy_versions (id, role, policy_key, policy_body, created_at)
       values (?, ?, ?, ?, ?)`
    ).run(
      'policy-version-1',
      'governance',
      'governance.review.policy',
      'Always require explicit evidence review.',
      '2026-03-29T00:00:00.000Z'
    )
    db.prepare(
      `insert into agent_policy_versions (id, role, policy_key, policy_body, created_at)
       values (?, ?, ?, ?, ?)`
    ).run(
      'policy-version-2',
      'governance',
      'governance.review.policy',
      'Require explicit evidence review and bounded verification.',
      '2026-03-30T00:00:00.000Z'
    )

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

    const started = await runtime.startObjective({
      title: 'Audit the latest governance policy change',
      objectiveKind: 'policy_change',
      prompt: 'Audit the latest governance policy change before rollout.',
      initiatedBy: 'operator'
    })
    const policySpec = createSubagentRegistryService().buildSpawnSubagentSpec({
      specialization: 'policy-auditor',
      payload: {
        policyKey: 'governance.review.policy'
      }
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'governance',
      proposalKind: 'spawn_subagent',
      payload: policySpec.payload,
      ownerRole: 'governance',
      requiresOperatorConfirmation: false,
      toolPolicyId: policySpec.toolPolicyId,
      budget: policySpec.budget
    })

    const approved = await runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'governance',
      response: 'approve',
      comment: 'Owner approved bounded policy auditing.'
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })
    const subagent = detail?.subagents.find((candidate) => candidate.specialization === 'policy-auditor')
    const subthread = runtime.getThreadDetail({
      threadId: subagent?.threadId ?? ''
    })
    const toolExecutions = db.prepare(
      `select tool_name as toolName, status
       from agent_tool_executions
       where objective_id = ?
       order by created_at asc`
    ).all(started.objective.objectiveId) as Array<{ toolName: string; status: string }>

    expect(approved?.status).toBe('committed')
    expect(subagent?.status).toBe('completed')
    expect(subthread?.messages.map((message) => message.kind)).toEqual([
      'goal',
      'tool_result',
      'tool_result',
      'final_response'
    ])
    expect(subthread?.messages.at(-1)?.body).toMatch(/policy-version-2/i)
    expect(toolExecutions).toEqual([
      { toolName: 'read_policy_versions', status: 'completed' },
      { toolName: 'compare_policy_versions', status: 'completed' }
    ])

    db.close()
  })

  it('fails compare-analyst execution when the budget does not cover both bounded compare steps', async () => {
    const db = setupDatabase()
    const runMemoryWorkspaceCompare = async () => ({
      compareSessionId: 'compare-session-1',
      scope: { kind: 'global' as const },
      title: 'Memory Workspace Compare',
      question: 'Compare grounded answer candidates for this request.',
      expressionMode: 'grounded' as const,
      workflowKind: 'default' as const,
      runCount: 1,
      metadata: {
        completedRunCount: 1,
        failedRunCount: 0,
        judgeStatus: 'ready' as const
      },
      recommendation: {
        status: 'ready' as const,
        recommendedCompareRunId: 'compare-run-local',
        reason: 'The baseline answer stayed the most grounded.'
      },
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:10.000Z',
      runs: [
        {
          compareRunId: 'compare-run-local',
          compareSessionId: 'compare-session-1',
          ordinal: 1,
          targetId: 'local-baseline',
          targetLabel: 'Local baseline',
          executionMode: 'local_baseline' as const,
          provider: null,
          model: null,
          status: 'completed' as const,
          errorMessage: null,
          response: null,
          evaluation: null,
          judgeVerdict: null,
          promptHash: 'prompt-hash-1',
          contextHash: 'context-hash-1',
          createdAt: '2026-03-30T00:00:00.000Z'
        }
      ]
    })
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
      subagentRegistry: createSubagentRegistryService(),
      runMemoryWorkspaceCompare
    } as any)

    const started = await runtime.startObjective({
      title: 'Compare with a deliberately tight budget',
      objectiveKind: 'user_response',
      prompt: 'Compare grounded answer candidates for this request.',
      initiatedBy: 'operator'
    })
    const compareSpec = createSubagentRegistryService().buildSpawnSubagentSpec({
      specialization: 'compare-analyst',
      payload: {
        question: 'Compare grounded answer candidates for this request.'
      }
    })

    const proposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'spawn_subagent',
      payload: compareSpec.payload,
      ownerRole: 'workspace',
      requiresOperatorConfirmation: false,
      toolPolicyId: compareSpec.toolPolicyId,
      budget: {
        ...compareSpec.budget,
        maxToolCalls: 1
      }
    })

    await expect(runtime.respondToAgentProposal({
      proposalId: proposal.proposalId,
      responderRole: 'workspace',
      response: 'approve',
      comment: 'Owner approved a too-small compare budget.'
    })).rejects.toThrow(/remaining budget is exhausted/i)

    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })
    const subagent = detail?.subagents.find((candidate) => candidate.specialization === 'compare-analyst')
    const toolExecutions = db.prepare(
      `select tool_name as toolName, status
       from agent_tool_executions
       where objective_id = ?
       order by created_at asc`
    ).all(started.objective.objectiveId) as Array<{ toolName: string; status: string }>

    expect(subagent?.status).toBe('failed')
    expect(toolExecutions).toEqual([
      { toolName: 'run_compare', status: 'completed' },
      { toolName: 'summarize_compare_results', status: 'blocked' }
    ])

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

    const started = await runtime.startObjective({
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

    const started = await runtime.startObjective({
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

    const started = await runtime.startObjective({
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
