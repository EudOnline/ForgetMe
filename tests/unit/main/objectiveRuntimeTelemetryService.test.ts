import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createMainThread, createObjective, createProposal, updateObjectiveStatus, updateProposalStatus } from '../../../src/main/services/objectivePersistenceService'
import { createObjectiveRuntimeTelemetryService } from '../../../src/main/services/objectiveRuntimeTelemetryService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-runtime-telemetry-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('objective runtime telemetry service', () => {
  it('records structured runtime events and summarizes a scorecard', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })

    const completedObjective = createObjective(db, {
      title: 'Complete a bounded response',
      objectiveKind: 'user_response',
      prompt: 'Prepare the final answer.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const completedThread = createMainThread(db, {
      objectiveId: completedObjective.objectiveId,
      ownerRole: 'workspace',
      title: 'Completed thread'
    })
    const autoCommittedProposal = createProposal(db, {
      objectiveId: completedObjective.objectiveId,
      threadId: completedThread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'respond_to_user',
      payload: {
        responseDraft: 'Summarize the verified answer.'
      },
      ownerRole: 'workspace',
      status: 'committed',
      proposalRiskLevel: 'medium',
      autonomyDecision: 'auto_commit_with_audit',
      requiresOperatorConfirmation: false
    })
    updateProposalStatus(db, {
      proposalId: autoCommittedProposal.proposalId,
      status: 'committed'
    })
    updateObjectiveStatus(db, {
      objectiveId: completedObjective.objectiveId,
      status: 'completed'
    })

    telemetry.recordObjectiveStarted({
      objectiveId: completedObjective.objectiveId,
      threadId: completedThread.threadId,
      objectiveKind: completedObjective.objectiveKind,
      initiatedBy: completedObjective.initiatedBy
    })
    telemetry.recordProposalCreated(autoCommittedProposal)
    telemetry.recordProposalAutoCommitted(autoCommittedProposal)
    telemetry.recordObjectiveCompleted({
      objectiveId: completedObjective.objectiveId,
      threadId: completedThread.threadId,
      roundCount: 4
    })

    const gatedObjective = createObjective(db, {
      title: 'Await publication approval',
      objectiveKind: 'publication',
      prompt: 'Prepare a public publication request.',
      initiatedBy: 'operator',
      ownerRole: 'workspace',
      requiresOperatorInput: true
    })
    const gatedThread = createMainThread(db, {
      objectiveId: gatedObjective.objectiveId,
      ownerRole: 'workspace',
      title: 'Publication thread'
    })
    const gatedProposal = createProposal(db, {
      objectiveId: gatedObjective.objectiveId,
      threadId: gatedThread.threadId,
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

    telemetry.recordProposalCreated(gatedProposal)
    telemetry.recordProposalAwaitingOperator(gatedProposal)
    telemetry.recordObjectiveStalled({
      objectiveId: gatedObjective.objectiveId,
      threadId: gatedThread.threadId,
      roundCount: 2
    })
    telemetry.recordEvent({
      objectiveId: gatedObjective.objectiveId,
      threadId: gatedThread.threadId,
      proposalId: gatedProposal.proposalId,
      eventType: 'subagent_budget_exhausted',
      payload: {
        specialization: 'compare-analyst'
      },
      createdAt: '2026-04-04T13:00:00.000Z'
    })
    telemetry.recordEvent({
      objectiveId: gatedObjective.objectiveId,
      threadId: gatedThread.threadId,
      proposalId: gatedProposal.proposalId,
      eventType: 'tool_timeout',
      payload: {
        toolName: 'search_web'
      },
      createdAt: '2026-04-04T13:05:00.000Z'
    })
    telemetry.recordEvent({
      objectiveId: gatedObjective.objectiveId,
      threadId: gatedThread.threadId,
      proposalId: gatedProposal.proposalId,
      eventType: 'proposal_blocked',
      payload: {
        blocker: 'Operator requested a narrower publication scope.'
      },
      createdAt: '2026-04-04T13:10:00.000Z'
    })

    const events = telemetry.listEvents()
    const scorecard = telemetry.getScorecard()

    expect(events.map((event) => event.eventType)).toEqual([
      'objective_started',
      'proposal_created',
      'proposal_auto_committed',
      'objective_completed',
      'proposal_created',
      'proposal_awaiting_operator',
      'objective_stalled',
      'subagent_budget_exhausted',
      'tool_timeout',
      'proposal_blocked'
    ])
    expect(scorecard.totalProposalCount).toBe(2)
    expect(scorecard.autoCommitCount).toBe(1)
    expect(scorecard.operatorGatedCount).toBe(1)
    expect(scorecard.totalObjectiveCount).toBe(2)
    expect(scorecard.completedObjectiveCount).toBe(1)
    expect(scorecard.stalledObjectiveCount).toBe(1)
    expect(scorecard.criticalGateRate).toBe(1)
    expect(scorecard.meanRoundsToCompletion).toBe(4)
    expect(scorecard.operatorBacklogSize).toBe(1)
    expect(scorecard.autoCommitRateByRiskLevel.medium.rate).toBe(1)
    expect(scorecard.autoCommitRateByRiskLevel.critical.rate).toBe(0)
    expect(scorecard.budgetExhaustedCount).toBe(1)
    expect(scorecard.toolTimeoutCount).toBe(1)
    expect(scorecard.blockedDelta24h).toBe(1)
    expect(scorecard.stalledDelta24h).toBe(1)

    db.close()
  })
})
