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
})
