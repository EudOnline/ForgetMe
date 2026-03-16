import { describe, expect, it } from 'vitest'
import { listDecisionJournal } from '../../../src/main/services/journalService'
import {
  createPersonaDraftReviewFromTurn,
  getPersonaDraftReviewByTurn,
  transitionPersonaDraftReview,
  updatePersonaDraftReview
} from '../../../src/main/services/memoryWorkspaceDraftReviewService'
import { seedPersonaDraftReviewScenario } from './helpers/memoryWorkspaceScenario'

describe('memoryWorkspaceDraftReviewService', () => {
  it('creates a review from a sandbox turn and copies persona draft metadata', () => {
    const { db, sandboxTurn } = seedPersonaDraftReviewScenario()

    const review = createPersonaDraftReviewFromTurn(db, { turnId: sandboxTurn.turnId })
    const loaded = getPersonaDraftReviewByTurn(db, { turnId: sandboxTurn.turnId })

    expect(review?.sourceTurnId).toBe(sandboxTurn.turnId)
    expect(review?.status).toBe('draft')
    expect(review?.workflowKind).toBe('persona_draft_sandbox')
    expect(review?.baseDraft).toBe(sandboxTurn.response.personaDraft?.draft)
    expect(review?.editedDraft).toBe(sandboxTurn.response.personaDraft?.draft)
    expect(review?.reviewNotes).toBe('')
    expect(review?.supportingExcerpts).toEqual(sandboxTurn.response.personaDraft?.supportingExcerpts)
    expect(review?.trace).toEqual(sandboxTurn.response.personaDraft?.trace)
    expect(loaded).toEqual(review)

    db.close()
  })

  it('returns null when asked to create a review from a non-sandbox turn', () => {
    const { db, groundedTurn } = seedPersonaDraftReviewScenario()

    const review = createPersonaDraftReviewFromTurn(db, { turnId: groundedTurn.turnId })

    expect(review).toBeNull()
    expect(getPersonaDraftReviewByTurn(db, { turnId: groundedTurn.turnId })).toBeNull()

    db.close()
  })

  it('updates draft edits and review notes while the review is editable', () => {
    const { db, sandboxTurn } = seedPersonaDraftReviewScenario()
    const review = createPersonaDraftReviewFromTurn(db, { turnId: sandboxTurn.turnId })

    const updated = updatePersonaDraftReview(db, {
      draftReviewId: review!.draftReviewId,
      editedDraft: '可审阅草稿：先整理归档，再继续补齐细节。',
      reviewNotes: 'Sharper and easier to reuse.'
    })

    expect(updated?.editedDraft).toBe('可审阅草稿：先整理归档，再继续补齐细节。')
    expect(updated?.reviewNotes).toBe('Sharper and easier to reuse.')
    expect(Date.parse(updated?.updatedAt ?? '')).toBeGreaterThanOrEqual(Date.parse(review?.updatedAt ?? ''))

    db.close()
  })

  it('journals the in-review transition and exposes readable journal labels', () => {
    const { db, sandboxTurn } = seedPersonaDraftReviewScenario()
    const review = createPersonaDraftReviewFromTurn(db, { turnId: sandboxTurn.turnId })

    const transitioned = transitionPersonaDraftReview(db, {
      draftReviewId: review!.draftReviewId,
      status: 'in_review'
    })
    const journalEntries = listDecisionJournal(db, {
      decisionType: 'mark_persona_draft_in_review'
    })

    expect(transitioned?.status).toBe('in_review')
    expect(journalEntries).toHaveLength(1)
    expect(journalEntries[0]?.decisionLabel).toBe('Persona draft marked in review')
    expect(journalEntries[0]?.targetLabel).toContain('Persona draft review')

    db.close()
  })

  it('journals approval and stores the approval journal id on the review', () => {
    const { db, sandboxTurn } = seedPersonaDraftReviewScenario()
    const review = createPersonaDraftReviewFromTurn(db, { turnId: sandboxTurn.turnId })

    const approved = transitionPersonaDraftReview(db, {
      draftReviewId: review!.draftReviewId,
      status: 'approved'
    })
    const journalEntries = listDecisionJournal(db, {
      decisionType: 'approve_persona_draft_review'
    })

    expect(approved?.status).toBe('approved')
    expect(approved?.approvedJournalId).not.toBeNull()
    expect(journalEntries).toHaveLength(1)
    expect(journalEntries[0]?.targetId).toBe(review?.draftReviewId)

    db.close()
  })

  it('journals rejection and stores the rejection journal id on the review', () => {
    const { db, sandboxTurn } = seedPersonaDraftReviewScenario()
    const review = createPersonaDraftReviewFromTurn(db, { turnId: sandboxTurn.turnId })

    const rejected = transitionPersonaDraftReview(db, {
      draftReviewId: review!.draftReviewId,
      status: 'rejected'
    })
    const journalEntries = listDecisionJournal(db, {
      decisionType: 'reject_persona_draft_review'
    })

    expect(rejected?.status).toBe('rejected')
    expect(rejected?.rejectedJournalId).not.toBeNull()
    expect(journalEntries).toHaveLength(1)
    expect(journalEntries[0]?.targetId).toBe(review?.draftReviewId)

    db.close()
  })

  it('rejects illegal transitions after approval', () => {
    const { db, sandboxTurn } = seedPersonaDraftReviewScenario()
    const review = createPersonaDraftReviewFromTurn(db, { turnId: sandboxTurn.turnId })
    const approved = transitionPersonaDraftReview(db, {
      draftReviewId: review!.draftReviewId,
      status: 'approved'
    })

    const invalid = transitionPersonaDraftReview(db, {
      draftReviewId: review!.draftReviewId,
      status: 'draft'
    })
    const loaded = getPersonaDraftReviewByTurn(db, { turnId: sandboxTurn.turnId })

    expect(approved?.status).toBe('approved')
    expect(invalid).toBeNull()
    expect(loaded?.status).toBe('approved')

    db.close()
  })
})
