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

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-runtime-alert-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('objective runtime alert service', () => {
  it('persists alert severity, stable fingerprints, and lifecycle mutations', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const alertService = createObjectiveRuntimeAlertService({ db })

    const objective = createObjective(db, {
      title: 'Surface repeated blocked runtime failures',
      objectiveKind: 'publication',
      prompt: 'Persist a stable alert lifecycle for repeated blocked proposals.',
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
        blocker: 'Operator blocked the publication scope.'
      },
      createdAt: '2026-04-04T00:00:00.000Z'
    })
    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'proposal_blocked',
      payload: {
        proposalKind: proposal.proposalKind,
        blocker: 'Operator blocked the publication scope again.'
      },
      createdAt: '2026-04-04T00:05:00.000Z'
    })

    const [alert] = alertService.listObjectiveRuntimeAlerts()
    expect(alert).toMatchObject({
      fingerprint: `proposal_blocked:${proposal.proposalId}`,
      severity: 'critical',
      status: 'open',
      objectiveId: objective.objectiveId,
      proposalId: proposal.proposalId,
      firstEventId: expect.any(String),
      latestEventId: expect.any(String)
    })

    const acknowledged = alertService.acknowledgeObjectiveRuntimeAlert({
      alertId: alert.alertId,
      actor: 'operator:test'
    })
    expect(acknowledged).toMatchObject({
      status: 'acknowledged',
      acknowledgedBy: 'operator:test',
      acknowledgedAt: expect.any(String)
    })

    const resolved = alertService.resolveObjectiveRuntimeAlert({
      alertId: alert.alertId
    })
    expect(resolved).toMatchObject({
      status: 'resolved',
      resolvedAt: expect.any(String)
    })

    db.close()
  })

  it('reopens an acknowledged alert when a new matching incident arrives', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const alertService = createObjectiveRuntimeAlertService({ db })

    const objective = createObjective(db, {
      title: 'Replay an acknowledged timeout',
      objectiveKind: 'user_response',
      prompt: 'Reopen an acknowledged alert when the same incident happens again.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Timeout thread'
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
        toolName: 'run_compare'
      },
      createdAt: '2026-04-04T00:00:00.000Z'
    })

    const [firstAlert] = alertService.listObjectiveRuntimeAlerts()
    expect(firstAlert?.status).toBe('open')

    const acknowledged = alertService.acknowledgeObjectiveRuntimeAlert({
      alertId: firstAlert!.alertId,
      actor: 'operator:test'
    })
    expect(acknowledged?.status).toBe('acknowledged')

    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'tool_timeout',
      payload: {
        toolName: 'run_compare'
      },
      createdAt: '2026-04-04T00:10:00.000Z'
    })

    const [reopened] = alertService.listObjectiveRuntimeAlerts()
    expect(reopened).toMatchObject({
      alertId: firstAlert!.alertId,
      status: 'open',
      eventCount: 2,
      latestEventId: expect.any(String),
      acknowledgedAt: null,
      acknowledgedBy: null
    })

    db.close()
  })

  it('tracks incremental projection progress so subsequent syncs only apply new events', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const alertService = createObjectiveRuntimeAlertService({ db })

    const objective = createObjective(db, {
      title: 'Project timeout alerts incrementally',
      objectiveKind: 'user_response',
      prompt: 'Advance the runtime alert projection state as new incidents arrive.',
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
        toolName: 'run_compare'
      },
      createdAt: '2026-04-04T00:00:00.000Z'
    })
    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'tool_timeout',
      payload: {
        toolName: 'run_compare'
      },
      createdAt: '2026-04-04T00:05:00.000Z'
    })

    const [initialAlert] = alertService.listObjectiveRuntimeAlerts()
    const initialProjectionState = db.prepare(
      `select last_event_rowid as lastEventRowId
      from agent_runtime_alert_projection_state
      where projection_key = ?`
    ).get('runtime_alerts') as { lastEventRowId: number } | undefined

    expect(initialAlert?.eventCount).toBe(2)
    expect(initialProjectionState?.lastEventRowId).toBeGreaterThan(0)

    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'tool_timeout',
      payload: {
        toolName: 'run_compare'
      },
      createdAt: '2026-04-04T00:10:00.000Z'
    })

    const [incrementalAlert] = alertService.listObjectiveRuntimeAlerts()
    const advancedProjectionState = db.prepare(
      `select last_event_rowid as lastEventRowId
      from agent_runtime_alert_projection_state
      where projection_key = ?`
    ).get('runtime_alerts') as { lastEventRowId: number } | undefined

    expect(incrementalAlert).toMatchObject({
      alertId: initialAlert!.alertId,
      eventCount: 3
    })
    expect(advancedProjectionState?.lastEventRowId).toBeGreaterThan(initialProjectionState!.lastEventRowId)

    db.close()
  })

  it('reopens alerts from projection order even when a newly ingested event has an older createdAt timestamp', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const alertService = createObjectiveRuntimeAlertService({ db })

    const objective = createObjective(db, {
      title: 'Reopen by ingestion order',
      objectiveKind: 'user_response',
      prompt: 'Treat later-ingested matching incidents as the latest alert event even under timestamp skew.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Skewed timestamp thread'
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
        toolName: 'run_compare'
      },
      createdAt: '2026-04-04T00:10:00.000Z'
    })

    const [firstAlert] = alertService.listObjectiveRuntimeAlerts()
    const resolved = alertService.resolveObjectiveRuntimeAlert({
      alertId: firstAlert!.alertId
    })
    expect(resolved?.status).toBe('resolved')

    telemetry.recordEvent({
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      eventType: 'tool_timeout',
      payload: {
        toolName: 'run_compare_late_replay'
      },
      createdAt: '2026-04-04T00:05:00.000Z'
    })

    const [reopened] = alertService.listObjectiveRuntimeAlerts()
    expect(reopened).toMatchObject({
      alertId: firstAlert!.alertId,
      status: 'open',
      eventCount: 2,
      detail: 'Tool run_compare_late_replay exceeded its bounded runtime budget.'
    })
    expect(reopened?.latestEventId).not.toBe(firstAlert!.latestEventId)

    db.close()
  })

  it('does not double count alert history when projection state is rebuilt from an existing snapshot', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const alertService = createObjectiveRuntimeAlertService({ db })

    const objective = createObjective(db, {
      title: 'Resume projection from existing alerts',
      objectiveKind: 'publication',
      prompt: 'Do not replay all historical incidents when the projection state row is missing.',
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
        blocker: 'Operator blocked the publication scope again.'
      },
      createdAt: '2026-04-04T01:05:00.000Z'
    })

    const [initialAlert] = alertService.listObjectiveRuntimeAlerts()
    expect(initialAlert?.eventCount).toBe(2)

    db.prepare(
      'delete from agent_runtime_alert_projection_state where projection_key = ?'
    ).run('runtime_alerts')

    const [resumedAlert] = alertService.listObjectiveRuntimeAlerts()
    expect(resumedAlert).toMatchObject({
      alertId: initialAlert!.alertId,
      eventCount: 2
    })

    db.close()
  })

  it('does not open a write transaction when alert projection is already current', () => {
    const db = setupDatabase()
    const telemetry = createObjectiveRuntimeTelemetryService({ db })
    const alertService = createObjectiveRuntimeAlertService({ db })

    const objective = createObjective(db, {
      title: 'Steady-state alert refresh',
      objectiveKind: 'user_response',
      prompt: 'Do not open a write transaction when no new alertable events exist.',
      initiatedBy: 'operator',
      ownerRole: 'workspace'
    })
    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Steady-state alert thread'
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
        toolName: 'run_compare'
      },
      createdAt: '2026-04-04T00:00:00.000Z'
    })

    expect(alertService.listObjectiveRuntimeAlerts()).toHaveLength(1)

    const originalExec = db.exec.bind(db)
    ;(db as typeof db & { exec: typeof db.exec }).exec = ((sql: string) => {
      if (sql === 'begin immediate') {
        throw new Error('steady-state alert reads should not begin a write transaction')
      }

      return originalExec(sql)
    }) as typeof db.exec

    expect(alertService.listObjectiveRuntimeAlerts()).toHaveLength(1)

    ;(db as typeof db & { exec: typeof db.exec }).exec = originalExec as typeof db.exec
    db.close()
  })
})
