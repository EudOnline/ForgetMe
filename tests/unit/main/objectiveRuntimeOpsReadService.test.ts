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
})
