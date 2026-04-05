import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  createMainThread,
  createObjective,
  createProposal
} from '../../../src/main/services/objectivePersistenceService'
import { createObjectiveRuntimeAlertService } from '../../../src/main/services/objectiveRuntimeAlertService'
import { createObjectiveRuntimeTelemetryService } from '../../../src/main/services/objectiveRuntimeTelemetryService'
import { createObjectiveRuntimeOpsReadService } from '../../../src/main/services/objectiveRuntimeOpsReadService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-runtime-ops-read-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('objective runtime ops read service', () => {
  it('returns aggregate scorecard counts and rates for the runtime health surface', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const readService = createObjectiveRuntimeOpsReadService({ db })

    const objective = createObjective(db, {
      title: 'Gate a publication with operator review',
      objectiveKind: 'publication',
      prompt: 'Require explicit operator confirmation before publishing.',
      initiatedBy: 'operator',
      ownerRole: 'workspace',
      requiresOperatorInput: true
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Publication thread'
    })
    const proposal = createProposal(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'publish_draft',
      payload: {
        destination: 'public_share'
      },
      ownerRole: 'workspace',
      status: 'awaiting_operator',
      proposalRiskLevel: 'critical',
      autonomyDecision: 'await_operator',
      requiresOperatorConfirmation: true
    })

    telemetry.recordProposalCreated(proposal)
    telemetry.recordProposalAwaitingOperator(proposal)
    telemetry.recordObjectiveStalled({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      roundCount: 2
    })

    expect(readService.getRuntimeScorecard()).toMatchObject({
      totalProposalCount: 1,
      operatorGatedCount: 1,
      stalledObjectiveCount: 1,
      operatorBacklogSize: 1,
      criticalGateRate: 1
    })

    db.close()
  })

  it('lists recent incidents with objective and proposal filters', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const readService = createObjectiveRuntimeOpsReadService({ db })

    const firstObjective = createObjective(db, {
      title: 'Investigate the first objective',
      objectiveKind: 'evidence_investigation',
      prompt: 'Inspect the first incident trail.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const firstThread = createMainThread(db, {
      objectiveId: firstObjective.objectiveId,
      ownerRole: 'workspace',
      title: 'First thread'
    })
    const firstProposal = createProposal(db, {
      objectiveId: firstObjective.objectiveId,
      threadId: firstThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'verify_external_claim',
      payload: {
        claim: 'The official source confirms the announcement date.'
      },
      ownerRole: 'workspace',
      status: 'under_review',
      proposalRiskLevel: 'critical',
      autonomyDecision: 'await_operator',
      requiresOperatorConfirmation: true
    })

    const secondObjective = createObjective(db, {
      title: 'Investigate the second objective',
      objectiveKind: 'review_decision',
      prompt: 'Inspect a different incident trail.',
      initiatedBy: 'operator',
      ownerRole: 'review'
    })
    const secondThread = createMainThread(db, {
      objectiveId: secondObjective.objectiveId,
      ownerRole: 'review',
      title: 'Second thread'
    })
    const secondProposal = createProposal(db, {
      objectiveId: secondObjective.objectiveId,
      threadId: secondThread.threadId,
      proposedByParticipantId: 'review',
      proposalKind: 'approve_review_item',
      payload: {
        queueItemId: 'rq-ops-1'
      },
      ownerRole: 'review',
      status: 'blocked',
      proposalRiskLevel: 'high',
      autonomyDecision: 'await_operator',
      requiresOperatorConfirmation: true
    })

    telemetry.recordEvent({
      objectiveId: firstObjective.objectiveId,
      threadId: firstThread.threadId,
      proposalId: firstProposal.proposalId,
      eventType: 'proposal_awaiting_operator',
      payload: {
        proposalKind: firstProposal.proposalKind,
        proposalRiskLevel: firstProposal.proposalRiskLevel,
        blocker: 'Waiting for operator confirmation.'
      },
      createdAt: '2026-04-04T01:00:00.000Z'
    })
    telemetry.recordEvent({
      objectiveId: secondObjective.objectiveId,
      threadId: secondThread.threadId,
      proposalId: secondProposal.proposalId,
      eventType: 'proposal_blocked',
      payload: {
        proposalKind: secondProposal.proposalKind,
        proposalRiskLevel: secondProposal.proposalRiskLevel,
        blocker: 'Governance requested stronger evidence.'
      },
      createdAt: '2026-04-04T01:05:00.000Z'
    })

    expect(readService.listRecentIncidents({
      objectiveId: firstObjective.objectiveId
    })).toHaveLength(1)
    expect(readService.listRecentIncidents({
      proposalId: secondProposal.proposalId
    })).toEqual([
      expect.objectContaining({
        objectiveId: secondObjective.objectiveId,
        proposalId: secondProposal.proposalId,
        eventType: 'proposal_blocked'
      })
    ])

    db.close()
  })

  it('includes structured payload details that support incident drill-down in the UI', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const readService = createObjectiveRuntimeOpsReadService({ db })

    const objective = createObjective(db, {
      title: 'Replay a blocked proposal',
      objectiveKind: 'publication',
      prompt: 'Provide the operator enough detail to inspect a blocked proposal.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Blocked publication thread'
    })
    const proposal = createProposal(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'publish_draft',
      payload: {
        destination: 'public_share'
      },
      ownerRole: 'workspace',
      status: 'blocked',
      proposalRiskLevel: 'critical',
      autonomyDecision: 'await_operator',
      requiresOperatorConfirmation: true
    })

    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_blocked',
      payload: {
        proposalKind: proposal.proposalKind,
        proposalRiskLevel: proposal.proposalRiskLevel,
        autonomyDecision: proposal.autonomyDecision,
        blocker: 'Operator blocked until the publication scope is narrowed.',
        riskReasons: ['public_distribution_boundary']
      },
      createdAt: '2026-04-04T02:00:00.000Z'
    })

    expect(readService.listRecentIncidents()).toEqual([
      expect.objectContaining({
        objectiveId: objective.objectiveId,
        proposalId: proposal.proposalId,
        eventType: 'proposal_blocked',
        payload: expect.objectContaining({
          proposalKind: 'publish_draft',
          proposalRiskLevel: 'critical',
          autonomyDecision: 'await_operator',
          blocker: 'Operator blocked until the publication scope is narrowed.',
          riskReasons: ['public_distribution_boundary']
        })
      })
    ])

    db.close()
  })

  it('lists persisted runtime alerts with deterministic fingerprints and lifecycle state', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const readService = createObjectiveRuntimeOpsReadService({ db })

    const objective = createObjective(db, {
      title: 'Escalate repeated stalls into an alert',
      objectiveKind: 'evidence_investigation',
      prompt: 'Collapse repeated stalls into one runtime alert row.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Stalled thread'
    })

    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      eventType: 'objective_stalled',
      payload: {
        roundCount: 2
      },
      createdAt: '2026-04-04T03:00:00.000Z'
    })
    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      eventType: 'objective_stalled',
      payload: {
        roundCount: 3
      },
      createdAt: '2026-04-04T03:05:00.000Z'
    })

    expect(readService.listRuntimeAlerts()).toEqual([
      expect.objectContaining({
        fingerprint: `objective_stalled:${objective.objectiveId}`,
        severity: 'critical',
        status: 'open',
        objectiveId: objective.objectiveId,
        proposalId: null
      })
    ])

    db.close()
  })

  it('counts all open alerts in runtime health instead of truncating to a limited page', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const readService = createObjectiveRuntimeOpsReadService({ db })

    for (let index = 0; index < 205; index += 1) {
      const objective = createObjective(db, {
        title: `Timeout objective ${index + 1}`,
        objectiveKind: 'user_response',
        prompt: 'Count every open runtime alert.',
        initiatedBy: 'operator',
        ownerRole: 'workspace'
      })
      const thread = createMainThread(db, {
        objectiveId: objective.objectiveId,
        ownerRole: 'workspace',
        title: `Timeout thread ${index + 1}`
      })
      const proposal = createProposal(db, {
        objectiveId: objective.objectiveId,
        threadId: thread.threadId,
        proposedByParticipantId: 'workspace',
        proposalKind: 'spawn_subagent',
        payload: {
          specialization: 'compare-analyst',
          question: `Compare question ${index + 1}`
        },
        ownerRole: 'workspace',
        status: 'committed',
        proposalRiskLevel: 'low',
        autonomyDecision: 'auto_commit',
        requiresOperatorConfirmation: false
      })

      telemetry.recordEvent({
        objectiveId: objective.objectiveId,
        threadId: thread.threadId,
        proposalId: proposal.proposalId,
        eventType: 'tool_timeout',
        payload: {
          toolName: 'run_compare'
        },
        createdAt: `2026-04-04T00:${String(index % 60).padStart(2, '0')}:00.000Z`
      })
    }

    expect(readService.getRuntimeScorecard()).toMatchObject({
      warningAlertCount: 205,
      criticalAlertCount: 0
    })

    db.close()
  }, 20_000)

  it('summarizes unstable proposal kinds, specializations, recovery reasons, and reopened alerts for runtime audit', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const alertService = createObjectiveRuntimeAlertService({ db })
    const readService = createObjectiveRuntimeOpsReadService({ db })

    const compareObjective = createObjective(db, {
      title: 'Track compare instability',
      objectiveKind: 'user_response',
      prompt: 'Aggregate failing compare paths.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const compareThread = createMainThread(db, {
      objectiveId: compareObjective.objectiveId,
      ownerRole: 'workspace',
      title: 'Compare thread'
    })
    const compareProposal = createProposal(db, {
      objectiveId: compareObjective.objectiveId,
      threadId: compareThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'spawn_subagent',
      payload: {
        specialization: 'compare-analyst',
        question: 'Compare grounded answer candidates.'
      },
      ownerRole: 'workspace',
      status: 'committed',
      proposalRiskLevel: 'low',
      autonomyDecision: 'auto_commit',
      requiresOperatorConfirmation: false
    })

    telemetry.recordEvent({
      objectiveId: compareObjective.objectiveId,
      threadId: compareThread.threadId,
      proposalId: compareProposal.proposalId,
      eventType: 'tool_timeout',
      payload: {
        toolName: 'run_compare',
        specialization: 'compare-analyst'
      },
      createdAt: '2026-04-04T00:00:00.000Z'
    })
    const [compareAlert] = alertService.listObjectiveRuntimeAlerts()
    alertService.acknowledgeObjectiveRuntimeAlert({
      alertId: compareAlert!.alertId,
      actor: 'operator:test'
    })
    telemetry.recordEvent({
      objectiveId: compareObjective.objectiveId,
      threadId: compareThread.threadId,
      proposalId: compareProposal.proposalId,
      eventType: 'tool_timeout',
      payload: {
        toolName: 'run_compare',
        specialization: 'compare-analyst'
      },
      createdAt: '2026-04-04T00:10:00.000Z'
    })

    const verificationObjective = createObjective(db, {
      title: 'Track external verification instability',
      objectiveKind: 'evidence_investigation',
      prompt: 'Aggregate external verification failures.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const verificationThread = createMainThread(db, {
      objectiveId: verificationObjective.objectiveId,
      ownerRole: 'workspace',
      title: 'Verification thread'
    })
    const verificationProposal = createProposal(db, {
      objectiveId: verificationObjective.objectiveId,
      threadId: verificationThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'verify_external_claim',
      payload: {
        claim: 'The source confirms the announcement date.',
        query: 'official announcement date'
      },
      ownerRole: 'workspace',
      status: 'under_review',
      proposalRiskLevel: 'critical',
      autonomyDecision: 'await_operator',
      requiresOperatorConfirmation: true
    })

    telemetry.recordEvent({
      objectiveId: verificationObjective.objectiveId,
      threadId: verificationThread.threadId,
      proposalId: verificationProposal.proposalId,
      eventType: 'recovery_exhausted',
      payload: {
        decision: 'surface_to_operator',
        reason: 'external_or_public_boundary',
        failureType: 'tool_timeout',
        attemptNumber: 0
      },
      createdAt: '2026-04-04T01:00:00.000Z'
    })

    const blockedObjective = createObjective(db, {
      title: 'Track publication blocking',
      objectiveKind: 'publication',
      prompt: 'Aggregate blocked publication failures.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const blockedThread = createMainThread(db, {
      objectiveId: blockedObjective.objectiveId,
      ownerRole: 'workspace',
      title: 'Blocked thread'
    })
    const blockedProposal = createProposal(db, {
      objectiveId: blockedObjective.objectiveId,
      threadId: blockedThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'publish_draft',
      payload: {
        destination: 'public_share'
      },
      ownerRole: 'workspace',
      status: 'blocked',
      proposalRiskLevel: 'critical',
      autonomyDecision: 'await_operator',
      requiresOperatorConfirmation: true
    })

    telemetry.recordEvent({
      objectiveId: blockedObjective.objectiveId,
      threadId: blockedThread.threadId,
      proposalId: blockedProposal.proposalId,
      eventType: 'proposal_blocked',
      payload: {
        proposalKind: 'publish_draft',
        blocker: 'Operator blocked public publication.'
      },
      createdAt: '2026-04-04T02:00:00.000Z'
    })

    const scorecard = readService.getRuntimeScorecard()

    expect(scorecard.runtimeAuditSummary).toMatchObject({
      topFailureProposalKinds: expect.arrayContaining([
        expect.objectContaining({ label: 'spawn_subagent', count: 2 }),
        expect.objectContaining({ label: 'publish_draft', count: 1 }),
        expect.objectContaining({ label: 'verify_external_claim', count: 1 })
      ]),
      topFailureSpecializations: expect.arrayContaining([
        expect.objectContaining({ label: 'compare-analyst', count: 2 }),
        expect.objectContaining({ label: 'web-verifier', count: 1 })
      ]),
      recoveryExhaustedReasons: [
        {
          label: 'external_or_public_boundary',
          count: 1
        }
      ],
      reopenedAlertCount: 1,
      reopenedAlertRate: 0.5
    })

    db.close()
  })

  it('reuses projected runtime audit buckets without rescanning the full runtime event history', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const alertService = createObjectiveRuntimeAlertService({ db })
    const readService = createObjectiveRuntimeOpsReadService({ db })

    const objective = createObjective(db, {
      title: 'Project runtime audit buckets once',
      objectiveKind: 'user_response',
      prompt: 'Persist runtime audit buckets so later reads do not rescan history.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Projection thread'
    })
    const proposal = createProposal(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'spawn_subagent',
      payload: {
        specialization: 'compare-analyst',
        question: 'Compare grounded answer candidates.'
      },
      ownerRole: 'workspace',
      status: 'committed',
      proposalRiskLevel: 'low',
      autonomyDecision: 'auto_commit',
      requiresOperatorConfirmation: false
    })

    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'tool_timeout',
      payload: {
        specialization: 'compare-analyst',
        toolName: 'run_compare'
      },
      createdAt: '2026-04-04T00:00:00.000Z'
    })

    const projectedScorecard = readService.getRuntimeScorecard()
    const runtimeTelemetryWithoutEventScans = {
      getScorecard: () => projectedScorecard,
      listEvents: () => {
        throw new Error('runtime audit should read from the projection, not rescan runtime events')
      }
    } as const

    const projectedReadService = createObjectiveRuntimeOpsReadService({
      db,
      runtimeTelemetry: runtimeTelemetryWithoutEventScans as never,
      runtimeAlertService: alertService
    })

    expect(projectedReadService.getRuntimeScorecard().runtimeAuditSummary).toMatchObject({
      topFailureProposalKinds: [
        {
          label: 'spawn_subagent',
          count: 1
        }
      ],
      topFailureSpecializations: [
        {
          label: 'compare-analyst',
          count: 1
        }
      ]
    })

    db.close()
  })

  it('does not double count runtime audit buckets when the audit projection state is rebuilt from persisted aggregates', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const readService = createObjectiveRuntimeOpsReadService({ db })

    const objective = createObjective(db, {
      title: 'Resume runtime audit projection',
      objectiveKind: 'publication',
      prompt: 'Do not replay audit history when only the projection state row is missing.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Audit projection resume thread'
    })
    const proposal = createProposal(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'publish_draft',
      payload: {
        destination: 'public_share'
      },
      ownerRole: 'workspace',
      status: 'blocked',
      proposalRiskLevel: 'critical',
      autonomyDecision: 'await_operator',
      requiresOperatorConfirmation: true
    })

    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_blocked',
      payload: {
        proposalKind: 'publish_draft',
        blocker: 'Operator blocked the publication scope.'
      },
      createdAt: '2026-04-04T01:00:00.000Z'
    })
    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_blocked',
      payload: {
        proposalKind: 'publish_draft',
        blocker: 'Operator blocked the publication scope again.'
      },
      createdAt: '2026-04-04T01:05:00.000Z'
    })

    const initialScorecard = readService.getRuntimeScorecard()
    expect(initialScorecard.runtimeAuditSummary.topFailureProposalKinds).toEqual([
      {
        label: 'publish_draft',
        count: 2
      }
    ])

    db.prepare(
      'delete from agent_runtime_audit_projection_state where projection_key = ?'
    ).run('runtime_audit')

    const resumedScorecard = readService.getRuntimeScorecard()
    expect(resumedScorecard.runtimeAuditSummary.topFailureProposalKinds).toEqual([
      {
        label: 'publish_draft',
        count: 2
      }
    ])

    db.close()
  })

  it('does not open write transactions for runtime snapshot reads when all projections are already current', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({
      db,
      now: () => '2026-04-04T13:30:00.000Z'
    })
    const readService = createObjectiveRuntimeOpsReadService({
      db,
      runtimeTelemetry: telemetry
    })

    const objective = createObjective(db, {
      title: 'Steady-state runtime ops refresh',
      objectiveKind: 'publication',
      prompt: 'Do not open write transactions when runtime projections are already current.',
      initiatedBy: 'operator',
      ownerRole: 'workspace',
      requiresOperatorInput: true
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Steady-state runtime ops thread'
    })
    const proposal = createProposal(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'publish_draft',
      payload: {
        destination: 'public_share'
      },
      ownerRole: 'workspace',
      status: 'awaiting_operator',
      proposalRiskLevel: 'critical',
      autonomyDecision: 'await_operator',
      requiresOperatorConfirmation: true
    })

    telemetry.recordProposalCreated(proposal, '2026-04-04T12:00:00.000Z')
    telemetry.recordProposalAwaitingOperator(proposal, '2026-04-04T12:05:00.000Z')
    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_blocked',
      payload: {
        proposalKind: 'publish_draft',
        blocker: 'Operator requested a narrower publication scope.'
      },
      createdAt: '2026-04-04T12:10:00.000Z'
    })

    expect(readService.getRuntimeScorecard()).toMatchObject({
      totalProposalCount: 1,
      operatorGatedCount: 1,
      blockedCount: 1
    })

    const originalExec = db.exec.bind(db)
    ;(db as typeof db & { exec: typeof db.exec }).exec = ((sql: string) => {
      if (sql === 'begin immediate') {
        throw new Error('steady-state runtime ops reads should not begin a write transaction')
      }

      return originalExec(sql)
    }) as typeof db.exec

    expect(readService.getRuntimeScorecard()).toMatchObject({
      totalProposalCount: 1,
      operatorGatedCount: 1,
      blockedCount: 1
    })

    ;(db as typeof db & { exec: typeof db.exec }).exec = originalExec as typeof db.exec
    db.close()
  })

  it('reports projection health for alert, audit, and scorecard projections without triggering writes', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({
      db,
      now: () => '2026-04-04T14:00:00.000Z'
    })
    const readService = createObjectiveRuntimeOpsReadService({
      db,
      runtimeTelemetry: telemetry
    })

    const objective = createObjective(db, {
      title: 'Projection health objective',
      objectiveKind: 'publication',
      prompt: 'Inspect projection lag and current row pointers.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Projection health thread'
    })
    const proposal = createProposal(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'publish_draft',
      payload: {
        destination: 'public_share'
      },
      ownerRole: 'workspace',
      status: 'blocked',
      proposalRiskLevel: 'critical',
      autonomyDecision: 'await_operator',
      requiresOperatorConfirmation: true
    })

    telemetry.recordProposalCreated(proposal, '2026-04-04T12:00:00.000Z')
    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_blocked',
      payload: {
        proposalKind: 'publish_draft',
        blocker: 'Operator blocked publication.'
      },
      createdAt: '2026-04-04T12:05:00.000Z'
    })

    readService.getRuntimeScorecard()
    const healthy = readService.getRuntimeProjectionHealth()

    expect(healthy).toEqual(expect.arrayContaining([
      expect.objectContaining({
        projectionKey: 'runtime_alerts',
        lagEvents: 0,
        isCurrent: true
      }),
      expect.objectContaining({
        projectionKey: 'runtime_audit',
        lagEvents: 0,
        isCurrent: true
      }),
      expect.objectContaining({
        projectionKey: 'runtime_scorecard',
        lagEvents: 0,
        isCurrent: true
      })
    ]))

    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_blocked',
      payload: {
        proposalKind: 'publish_draft',
        blocker: 'Operator blocked publication again.'
      },
      createdAt: '2026-04-04T12:10:00.000Z'
    })

    const lagging = readService.getRuntimeProjectionHealth()
    expect(lagging.some((projection) => (
      projection.projectionKey === 'runtime_alerts'
      && projection.lagEvents > 0
      && projection.isCurrent === false
    ))).toBe(true)

    const originalExec = db.exec.bind(db)
    ;(db as typeof db & { exec: typeof db.exec }).exec = ((sql: string) => {
      if (sql === 'begin immediate') {
        throw new Error('projection health reads should not begin write transactions')
      }

      return originalExec(sql)
    }) as typeof db.exec

    expect(readService.getRuntimeProjectionHealth()).toEqual(expect.any(Array))

    ;(db as typeof db & { exec: typeof db.exec }).exec = originalExec as typeof db.exec
    db.close()
  })
})
