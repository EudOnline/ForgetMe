import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewWorkbenchPage } from '../../../src/renderer/pages/ReviewWorkbenchPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReviewWorkbenchPage actions', () => {
  it('shows approve, reject, and undo actions next to impact preview and refreshes stale state', async () => {
    const approveReviewItem = vi.fn().mockResolvedValue({ status: 'approved', journalId: 'j-1', queueItemId: 'rq-1', candidateId: 'fc-1' })
    const rejectReviewItem = vi.fn().mockResolvedValue({ status: 'rejected', journalId: 'j-2', queueItemId: 'rq-1', candidateId: 'fc-1' })
    const undoDecision = vi.fn().mockResolvedValue({ status: 'undone', journalId: 'j-1' })
    const listReviewWorkbenchItems = vi
      .fn()
      .mockResolvedValueOnce([
        {
          queueItemId: 'rq-1',
          itemType: 'structured_field_candidate',
          candidateId: 'fc-1',
          status: 'pending',
          priority: 0,
          confidence: 0.98,
          summary: { fieldKey: 'school_name' },
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'school_name',
          displayValue: '北京大学',
          hasConflict: false,
          createdAt: '2026-03-11T00:00:00.000Z',
          reviewedAt: null
        }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const getReviewWorkbenchItem = vi
      .fn()
      .mockResolvedValueOnce({
        item: {
          queueItemId: 'rq-1',
          itemType: 'structured_field_candidate',
          candidateId: 'fc-1',
          status: 'pending',
          priority: 0,
          confidence: 0.98,
          summary: { fieldKey: 'school_name' },
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'school_name',
          displayValue: '北京大学',
          hasConflict: false,
          createdAt: '2026-03-11T00:00:00.000Z',
          reviewedAt: null
        },
        queueItem: {
          id: 'rq-1', itemType: 'structured_field_candidate', candidateId: 'fc-1', status: 'pending', priority: 0, confidence: 0.98, summary: { fieldKey: 'school_name' }, createdAt: '2026-03-11T00:00:00.000Z', reviewedAt: null
        },
        candidate: {
          id: 'fc-1', fileId: 'f-1', jobId: 'job-1', fieldType: 'education', fieldKey: 'school_name', fieldValue: '北京大学', documentType: 'transcript', confidence: 0.98, riskLevel: 'high', sourcePage: 1, status: 'pending', createdAt: '2026-03-11T00:00:00.000Z', reviewedAt: null, reviewNote: null, queueItemId: 'rq-1'
        },
        trace: {
          queueItem: {
            id: 'rq-1', itemType: 'structured_field_candidate', candidateId: 'fc-1', status: 'pending', priority: 0, confidence: 0.98, summary: { fieldKey: 'school_name' }, createdAt: '2026-03-11T00:00:00.000Z', reviewedAt: null
          },
          candidate: null,
          sourceFile: { fileId: 'f-1', fileName: 'transcript.pdf', batchId: 'b-1', fileKind: '.pdf' },
          sourceEvidence: { evidenceId: 'ee-1', evidenceType: 'approved_structured_field', status: 'approved', riskLevel: 'high', payloadJson: '{}', fileId: 'f-1', jobId: 'job-1' },
          sourceCandidate: null,
          sourceJournal: null
        },
        impactPreview: {
          approveImpact: { kind: 'project_formal_attribute', summary: 'Approving creates a formal profile attribute.', canonicalPersonId: 'cp-1', canonicalPersonName: 'Alice Chen', fieldKey: 'school_name', nextValue: '北京大学', currentValue: null, sourceEvidenceId: null, sourceCandidateId: 'fc-1', relatedJournalId: null },
          rejectImpact: { kind: 'reject_review_item', summary: 'Rejecting blocks projection.', canonicalPersonId: 'cp-1', sourceEvidenceId: null, sourceCandidateId: 'fc-1' },
          undoImpact: { kind: 'no_approved_decision', summary: 'Nothing to undo yet.', canonicalPersonId: 'cp-1', affectedJournalId: null, affectedAttributeIds: [] }
        },
        currentProfileAttributes: []
      })
      .mockResolvedValueOnce({
        item: {
          queueItemId: 'rq-1',
          itemType: 'structured_field_candidate',
          candidateId: 'fc-1',
          status: 'approved',
          priority: 0,
          confidence: 0.98,
          summary: { fieldKey: 'school_name' },
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'school_name',
          displayValue: '北京大学',
          hasConflict: false,
          createdAt: '2026-03-11T00:00:00.000Z',
          reviewedAt: '2026-03-11T00:05:00.000Z'
        },
        queueItem: {
          id: 'rq-1', itemType: 'structured_field_candidate', candidateId: 'fc-1', status: 'approved', priority: 0, confidence: 0.98, summary: { fieldKey: 'school_name' }, createdAt: '2026-03-11T00:00:00.000Z', reviewedAt: '2026-03-11T00:05:00.000Z'
        },
        candidate: {
          id: 'fc-1', fileId: 'f-1', jobId: 'job-1', fieldType: 'education', fieldKey: 'school_name', fieldValue: '北京大学', documentType: 'transcript', confidence: 0.98, riskLevel: 'high', sourcePage: 1, status: 'approved', createdAt: '2026-03-11T00:00:00.000Z', reviewedAt: '2026-03-11T00:05:00.000Z', reviewNote: null, queueItemId: 'rq-1'
        },
        trace: {
          queueItem: {
            id: 'rq-1', itemType: 'structured_field_candidate', candidateId: 'fc-1', status: 'approved', priority: 0, confidence: 0.98, summary: { fieldKey: 'school_name' }, createdAt: '2026-03-11T00:00:00.000Z', reviewedAt: '2026-03-11T00:05:00.000Z'
          },
          candidate: null,
          sourceFile: { fileId: 'f-1', fileName: 'transcript.pdf', batchId: 'b-1', fileKind: '.pdf' },
          sourceEvidence: { evidenceId: 'ee-1', evidenceType: 'approved_structured_field', status: 'approved', riskLevel: 'high', payloadJson: '{}', fileId: 'f-1', jobId: 'job-1' },
          sourceCandidate: null,
          sourceJournal: { id: 'j-1', decisionType: 'approve_structured_field_candidate', targetType: 'structured_field_candidate', targetId: 'fc-1', operationPayload: {}, undoPayload: { evidenceId: 'ee-1' }, actor: 'local-user', createdAt: '2026-03-11T00:05:00.000Z', undoneAt: null, undoneBy: null }
        },
        impactPreview: {
          approveImpact: { kind: 'project_formal_attribute', summary: 'Approving creates a formal profile attribute.', canonicalPersonId: 'cp-1', canonicalPersonName: 'Alice Chen', fieldKey: 'school_name', nextValue: '北京大学', currentValue: null, sourceEvidenceId: 'ee-1', sourceCandidateId: 'fc-1', relatedJournalId: 'j-1' },
          rejectImpact: { kind: 'reject_review_item', summary: 'Rejecting blocks projection.', canonicalPersonId: 'cp-1', sourceEvidenceId: 'ee-1', sourceCandidateId: 'fc-1' },
          undoImpact: { kind: 'rollback_structured_field_approval', summary: 'Undo removes approved evidence.', canonicalPersonId: 'cp-1', affectedJournalId: 'j-1', affectedAttributeIds: ['attr-1'] }
        },
        currentProfileAttributes: []
      })
      .mockResolvedValueOnce({
        item: {
          queueItemId: 'rq-1',
          itemType: 'structured_field_candidate',
          candidateId: 'fc-1',
          status: 'undone',
          priority: 0,
          confidence: 0.98,
          summary: { fieldKey: 'school_name' },
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'school_name',
          displayValue: '北京大学',
          hasConflict: false,
          createdAt: '2026-03-11T00:00:00.000Z',
          reviewedAt: '2026-03-11T00:06:00.000Z'
        },
        queueItem: {
          id: 'rq-1', itemType: 'structured_field_candidate', candidateId: 'fc-1', status: 'undone', priority: 0, confidence: 0.98, summary: { fieldKey: 'school_name' }, createdAt: '2026-03-11T00:00:00.000Z', reviewedAt: '2026-03-11T00:06:00.000Z'
        },
        candidate: {
          id: 'fc-1', fileId: 'f-1', jobId: 'job-1', fieldType: 'education', fieldKey: 'school_name', fieldValue: '北京大学', documentType: 'transcript', confidence: 0.98, riskLevel: 'high', sourcePage: 1, status: 'undone', createdAt: '2026-03-11T00:00:00.000Z', reviewedAt: '2026-03-11T00:06:00.000Z', reviewNote: null, queueItemId: 'rq-1'
        },
        trace: {
          queueItem: {
            id: 'rq-1', itemType: 'structured_field_candidate', candidateId: 'fc-1', status: 'undone', priority: 0, confidence: 0.98, summary: { fieldKey: 'school_name' }, createdAt: '2026-03-11T00:00:00.000Z', reviewedAt: '2026-03-11T00:06:00.000Z'
          },
          candidate: null,
          sourceFile: { fileId: 'f-1', fileName: 'transcript.pdf', batchId: 'b-1', fileKind: '.pdf' },
          sourceEvidence: null,
          sourceCandidate: null,
          sourceJournal: { id: 'j-1', decisionType: 'approve_structured_field_candidate', targetType: 'structured_field_candidate', targetId: 'fc-1', operationPayload: {}, undoPayload: { evidenceId: 'ee-1' }, actor: 'local-user', createdAt: '2026-03-11T00:05:00.000Z', undoneAt: '2026-03-11T00:06:00.000Z', undoneBy: 'local-user' }
        },
        impactPreview: {
          approveImpact: { kind: 'project_formal_attribute', summary: 'Approving creates a formal profile attribute.', canonicalPersonId: 'cp-1', canonicalPersonName: 'Alice Chen', fieldKey: 'school_name', nextValue: '北京大学', currentValue: null, sourceEvidenceId: null, sourceCandidateId: 'fc-1', relatedJournalId: 'j-1' },
          rejectImpact: { kind: 'reject_review_item', summary: 'Rejecting blocks projection.', canonicalPersonId: 'cp-1', sourceEvidenceId: null, sourceCandidateId: 'fc-1' },
          undoImpact: { kind: 'rollback_review_decision', summary: 'Undo already applied.', canonicalPersonId: 'cp-1', affectedJournalId: null, affectedAttributeIds: [] }
        },
        currentProfileAttributes: []
      })

    vi.stubGlobal('window', {
      archiveApi: {
        listReviewWorkbenchItems,
        getReviewWorkbenchItem,
        approveReviewItem,
        rejectReviewItem,
        undoDecision
      }
    })

    render(<ReviewWorkbenchPage />)

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    })

    await screen.findByText('Selected item is no longer pending.')
    expect(approveReviewItem).toHaveBeenCalledWith('rq-1')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })

    expect(undoDecision).toHaveBeenCalledWith('j-1')
    expect(rejectReviewItem).not.toHaveBeenCalled()
  })
})
