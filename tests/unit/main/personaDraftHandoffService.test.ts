import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listDecisionJournal } from '../../../src/main/services/journalService'
import {
  buildApprovedPersonaDraftHandoffArtifact,
  exportApprovedPersonaDraftToDirectory,
  listApprovedPersonaDraftHandoffs
} from '../../../src/main/services/personaDraftHandoffService'
import { createPersonaDraftReviewFromTurn } from '../../../src/main/services/memoryWorkspaceDraftReviewService'
import {
  seedApprovedPersonaDraftHandoffScenario,
  seedPersonaDraftReviewScenario
} from './helpers/memoryWorkspaceScenario'

afterEach(() => {
  vi.useRealTimers()
})

describe('personaDraftHandoffService', () => {
  it('builds a complete approved draft handoff artifact from the approved review and source turn', () => {
    const { db, approvedReview, sandboxTurn } = seedApprovedPersonaDraftHandoffScenario()

    const artifact = buildApprovedPersonaDraftHandoffArtifact(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(artifact?.reviewStatus).toBe('approved')
    expect(artifact?.workflowKind).toBe('persona_draft_sandbox')
    expect(artifact?.draftReviewId).toBe(approvedReview.draftReviewId)
    expect(artifact?.sourceTurnId).toBe(sandboxTurn.turnId)
    expect(artifact?.question).toBe(sandboxTurn.question)
    expect(artifact?.approvedDraft).toContain('归档')
    expect(artifact?.communicationExcerpts[0]?.fileName).toBe('chat-1.json')
    expect(artifact?.shareEnvelope).toEqual({
      requestShape: 'local_json_persona_draft_handoff',
      policyKey: 'persona_draft.local_export_approved'
    })

    db.close()
  })

  it('returns null when the review is not approved', () => {
    const { db, sandboxTurn } = seedPersonaDraftReviewScenario()
    const review = createPersonaDraftReviewFromTurn(db, {
      turnId: sandboxTurn.turnId
    })

    const artifact = buildApprovedPersonaDraftHandoffArtifact(db, {
      draftReviewId: review!.draftReviewId
    })

    expect(review?.status).toBe('draft')
    expect(artifact).toBeNull()

    db.close()
  })

  it('exports the approved draft as a deterministic json artifact', () => {
    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-persona-draft-handoff-'))

    const exported = exportApprovedPersonaDraftToDirectory(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationRoot: exportDir
    })

    expect(exported?.status).toBe('exported')
    expect(exported?.fileName).toBe(`persona-draft-review-${approvedReview.draftReviewId}-approved.json`)
    expect(exported?.filePath).toBe(path.join(exportDir, exported!.fileName))

    const payload = JSON.parse(fs.readFileSync(exported!.filePath, 'utf8'))
    expect(payload.formatVersion).toBe('phase10e1')
    expect(payload.reviewStatus).toBe('approved')
    expect(payload.approvedDraft).toContain('归档')

    db.close()
  })

  it('journals approved draft export with a readable decision label', () => {
    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-persona-draft-handoff-'))

    const exported = exportApprovedPersonaDraftToDirectory(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationRoot: exportDir
    })
    const journalEntries = listDecisionJournal(db, {
      decisionType: 'export_approved_persona_draft'
    })

    expect(exported?.status).toBe('exported')
    expect(journalEntries).toHaveLength(1)
    expect(journalEntries[0]?.decisionLabel).toBe('Approved draft exported')
    expect(journalEntries[0]?.targetId).toBe(approvedReview.draftReviewId)

    db.close()
  })

  it('lists approved persona draft handoffs newest first from decision journal history', () => {
    vi.useFakeTimers()

    const { db, approvedReview } = seedApprovedPersonaDraftHandoffScenario()
    const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-persona-draft-handoff-'))

    vi.setSystemTime(new Date('2026-03-16T03:00:00.000Z'))
    const firstExport = exportApprovedPersonaDraftToDirectory(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationRoot: exportDir
    })

    vi.setSystemTime(new Date('2026-03-16T03:05:00.000Z'))
    const secondExport = exportApprovedPersonaDraftToDirectory(db, {
      draftReviewId: approvedReview.draftReviewId,
      destinationRoot: exportDir
    })

    const history = listApprovedPersonaDraftHandoffs(db, {
      draftReviewId: approvedReview.draftReviewId
    })

    expect(firstExport?.status).toBe('exported')
    expect(secondExport?.status).toBe('exported')
    expect(history).toHaveLength(2)
    expect(history[0]?.exportedAt).toBe('2026-03-16T03:05:00.000Z')
    expect(history[1]?.exportedAt).toBe('2026-03-16T03:00:00.000Z')
    expect(history[0]?.journalId).not.toBe(history[1]?.journalId)

    db.close()
  })
})
