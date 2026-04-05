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
    const telemetry = createObjectiveRuntimeTelemetryService({
      db,
      now: () => '2026-04-04T13:30:00.000Z'
    })

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
      initiatedBy: completedObjective.initiatedBy,
      createdAt: '2026-04-04T12:00:00.000Z'
    })
    telemetry.recordProposalCreated(autoCommittedProposal, '2026-04-04T12:01:00.000Z')
    telemetry.recordProposalAutoCommitted(autoCommittedProposal, '2026-04-04T12:02:00.000Z')
    telemetry.recordObjectiveCompleted({
      objectiveId: completedObjective.objectiveId,
      threadId: completedThread.threadId,
      roundCount: 4,
      createdAt: '2026-04-04T12:03:00.000Z'
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

    telemetry.recordProposalCreated(gatedProposal, '2026-04-04T12:04:00.000Z')
    telemetry.recordProposalAwaitingOperator(gatedProposal, '2026-04-04T12:05:00.000Z')
    telemetry.recordObjectiveStalled({
      objectiveId: gatedObjective.objectiveId,
      threadId: gatedThread.threadId,
      roundCount: 2,
      createdAt: '2026-04-04T12:06:00.000Z'
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
    expect(scorecard.backlogNew24h).toBe(1)
    expect(scorecard.backlogResolved24h).toBe(0)
    expect(scorecard.backlogNet24h).toBe(1)
    expect(scorecard.stalledNew24h).toBe(1)
    expect(scorecard.stalledResolved24h).toBe(0)
    expect(scorecard.stalledNet24h).toBe(1)
    expect(scorecard.blockedNew24h).toBe(1)
    expect(scorecard.blockedResolved24h).toBe(0)
    expect(scorecard.blockedNet24h).toBe(1)
    expect(scorecard.blockedDelta24h).toBe(1)
    expect(scorecard.stalledDelta24h).toBe(1)

    db.close()
  })

  it('anchors trend windows to the current clock and reports resolved/net changes from the previous window', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({
      db,
      now: () => '2026-04-06T00:00:00.000Z'
    })

    const objective = createObjective(db, {
      title: 'Older stalled objective',
      objectiveKind: 'user_response',
      prompt: 'Do not keep stale 24h deltas alive forever.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Stale trend thread'
    })
    const proposal = createProposal(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'respond_to_user',
      payload: {
        responseDraft: 'Summarize the answer.'
      },
      ownerRole: 'workspace',
      status: 'awaiting_operator',
      proposalRiskLevel: 'medium',
      autonomyDecision: 'auto_commit_with_audit',
      requiresOperatorConfirmation: true
    })

    telemetry.recordProposalCreated(proposal, '2026-04-04T00:00:00.000Z')
    telemetry.recordProposalAwaitingOperator(proposal, '2026-04-04T00:05:00.000Z')
    telemetry.recordObjectiveStalled({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      roundCount: 2,
      createdAt: '2026-04-04T00:10:00.000Z'
    })
    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_blocked',
      payload: {
        blocker: 'Operator blocked the stale flow.'
      },
      createdAt: '2026-04-04T00:15:00.000Z'
    })

    const scorecard = telemetry.getScorecard()

    expect(scorecard.backlogNew24h).toBe(0)
    expect(scorecard.backlogResolved24h).toBe(1)
    expect(scorecard.backlogNet24h).toBe(-1)
    expect(scorecard.stalledNew24h).toBe(0)
    expect(scorecard.stalledResolved24h).toBe(1)
    expect(scorecard.stalledNet24h).toBe(-1)
    expect(scorecard.blockedNew24h).toBe(0)
    expect(scorecard.blockedResolved24h).toBe(1)
    expect(scorecard.blockedNet24h).toBe(-1)
    expect(scorecard.backlogDelta24h).toBe(-1)
    expect(scorecard.stalledDelta24h).toBe(-1)
    expect(scorecard.blockedDelta24h).toBe(-1)

    db.close()
  })

  it('reuses projected scorecard aggregates without loading the full runtime event history', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({
      db,
      now: () => '2026-04-04T13:30:00.000Z'
    })

    const objective = createObjective(db, {
      title: 'Project scorecard aggregates once',
      objectiveKind: 'user_response',
      prompt: 'Persist scorecard aggregates so later reads do not rescan all events.',
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
      proposalKind: 'respond_to_user',
      payload: {
        responseDraft: 'Summarize the answer.'
      },
      ownerRole: 'workspace',
      status: 'committed',
      proposalRiskLevel: 'medium',
      autonomyDecision: 'auto_commit',
      requiresOperatorConfirmation: false
    })

    telemetry.recordProposalCreated(proposal, '2026-04-04T12:00:00.000Z')
    telemetry.recordProposalAutoCommitted(proposal, '2026-04-04T12:01:00.000Z')

    const initialScorecard = telemetry.getScorecard()
    expect(initialScorecard.totalProposalCount).toBe(1)

    const originalPrepare = db.prepare.bind(db)
    ;(db as typeof db & {
      prepare: typeof db.prepare
    }).prepare = ((sql: string) => {
      if (
        sql.includes('from agent_runtime_events')
        && sql.includes('payload_json as payloadJson')
        && sql.includes('where (? is null or objective_id = ?)')
      ) {
        throw new Error('getScorecard should read from the projection, not list the full runtime event history')
      }

      return originalPrepare(sql)
    }) as typeof db.prepare

    const projectedTelemetry = createObjectiveRuntimeTelemetryService({
      db,
      now: () => '2026-04-04T13:30:00.000Z'
    })

    expect(projectedTelemetry.getScorecard()).toMatchObject({
      totalProposalCount: 1,
      autoCommitCount: 1
    })

    ;(db as typeof db & {
      prepare: typeof db.prepare
    }).prepare = originalPrepare as typeof db.prepare
    db.close()
  })

  it('does not double count scorecard aggregates when the projection state is rebuilt from persisted stats', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({
      db,
      now: () => '2026-04-04T13:30:00.000Z'
    })

    const objective = createObjective(db, {
      title: 'Resume scorecard projection',
      objectiveKind: 'publication',
      prompt: 'Do not replay scorecard history when only the projection state row is missing.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Projection resume thread'
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
        blocker: 'Operator blocked the publication scope.'
      },
      createdAt: '2026-04-04T12:10:00.000Z'
    })

    const initialScorecard = telemetry.getScorecard()
    expect(initialScorecard).toMatchObject({
      totalProposalCount: 1,
      operatorGatedCount: 1,
      blockedCount: 1
    })

    db.prepare(
      'delete from agent_runtime_scorecard_projection_state where projection_key = ?'
    ).run('runtime_scorecard')

    const resumedScorecard = telemetry.getScorecard()
    expect(resumedScorecard).toMatchObject({
      totalProposalCount: 1,
      operatorGatedCount: 1,
      blockedCount: 1
    })

    db.close()
  })

  it('does not open a write transaction when the scorecard projection is already current', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({
      db,
      now: () => '2026-04-04T13:30:00.000Z'
    })

    const objective = createObjective(db, {
      title: 'Steady-state scorecard refresh',
      objectiveKind: 'user_response',
      prompt: 'Do not open a write transaction when no new runtime events exist.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Steady-state telemetry thread'
    })
    const proposal = createProposal(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'respond_to_user',
      payload: {
        responseDraft: 'Summarize the answer.'
      },
      ownerRole: 'workspace',
      status: 'committed',
      proposalRiskLevel: 'medium',
      autonomyDecision: 'auto_commit',
      requiresOperatorConfirmation: false
    })

    telemetry.recordProposalCreated(proposal, '2026-04-04T12:00:00.000Z')
    telemetry.recordProposalAutoCommitted(proposal, '2026-04-04T12:01:00.000Z')

    expect(telemetry.getScorecard().totalProposalCount).toBe(1)

    const originalExec = db.exec.bind(db)
    ;(db as typeof db & { exec: typeof db.exec }).exec = ((sql: string) => {
      if (sql === 'begin immediate') {
        throw new Error('steady-state scorecard reads should not begin a write transaction')
      }

      return originalExec(sql)
    }) as typeof db.exec

    expect(telemetry.getScorecard()).toMatchObject({
      totalProposalCount: 1,
      autoCommitCount: 1
    })

    ;(db as typeof db & { exec: typeof db.exec }).exec = originalExec as typeof db.exec
    db.close()
  })
})
