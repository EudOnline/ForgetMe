import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewWorkbenchPage } from '../../../src/renderer/pages/ReviewWorkbenchPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReviewWorkbenchPage actions', () => {
  it('stays in the selected conflict group after approving and falls back to remaining person items when group empties', async () => {
    const approveReviewItem = vi.fn().mockResolvedValue({ status: 'approved', journalId: 'j-1', queueItemId: 'rq-1', candidateId: 'fc-1' })
    const rejectReviewItem = vi.fn().mockResolvedValue({ status: 'rejected', journalId: 'j-2', queueItemId: 'rq-1', candidateId: 'fc-1' })
    const undoDecision = vi.fn().mockResolvedValue({ status: 'undone', journalId: 'j-1' })

    const listReviewInboxPeople = vi
      .fn()
      .mockResolvedValueOnce([
        {
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          pendingCount: 3,
          conflictCount: 2,
          fieldKeys: ['birth_date', 'school_name'],
          itemTypes: ['structured_field_candidate'],
          nextQueueItemId: 'rq-1',
          latestPendingCreatedAt: '2026-03-11T00:10:00.000Z',
          hasContinuousSequence: true
        }
      ])
      .mockResolvedValueOnce([
        {
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          pendingCount: 3,
          conflictCount: 2,
          fieldKeys: ['birth_date', 'school_name'],
          itemTypes: ['structured_field_candidate'],
          nextQueueItemId: 'rq-1',
          latestPendingCreatedAt: '2026-03-11T00:10:00.000Z',
          hasContinuousSequence: true
        }
      ])
      .mockResolvedValueOnce([
        {
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          pendingCount: 2,
          conflictCount: 1,
          fieldKeys: ['birth_date', 'school_name'],
          itemTypes: ['structured_field_candidate'],
          nextQueueItemId: 'rq-2',
          latestPendingCreatedAt: '2026-03-11T00:10:00.000Z',
          hasContinuousSequence: true
        }
      ])
      .mockResolvedValueOnce([
        {
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          pendingCount: 1,
          conflictCount: 0,
          fieldKeys: ['birth_date'],
          itemTypes: ['structured_field_candidate'],
          nextQueueItemId: 'rq-3',
          latestPendingCreatedAt: '2026-03-11T00:10:00.000Z',
          hasContinuousSequence: false
        }
      ])

    const listReviewConflictGroups = vi
      .fn()
      .mockResolvedValueOnce([
        {
          groupKey: 'cp-1::structured_field_candidate::school_name',
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          itemType: 'structured_field_candidate',
          fieldKey: 'school_name',
          pendingCount: 2,
          distinctValues: ['北京大学', '清华大学'],
          hasConflict: true,
          nextQueueItemId: 'rq-1',
          latestPendingCreatedAt: '2026-03-11T00:05:00.000Z'
        },
        {
          groupKey: 'cp-1::structured_field_candidate::birth_date',
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          itemType: 'structured_field_candidate',
          fieldKey: 'birth_date',
          pendingCount: 1,
          distinctValues: ['1990-01-01'],
          hasConflict: false,
          nextQueueItemId: 'rq-3',
          latestPendingCreatedAt: '2026-03-11T00:10:00.000Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          groupKey: 'cp-1::structured_field_candidate::school_name',
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          itemType: 'structured_field_candidate',
          fieldKey: 'school_name',
          pendingCount: 2,
          distinctValues: ['北京大学', '清华大学'],
          hasConflict: true,
          nextQueueItemId: 'rq-1',
          latestPendingCreatedAt: '2026-03-11T00:05:00.000Z'
        },
        {
          groupKey: 'cp-1::structured_field_candidate::birth_date',
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          itemType: 'structured_field_candidate',
          fieldKey: 'birth_date',
          pendingCount: 1,
          distinctValues: ['1990-01-01'],
          hasConflict: false,
          nextQueueItemId: 'rq-3',
          latestPendingCreatedAt: '2026-03-11T00:10:00.000Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          groupKey: 'cp-1::structured_field_candidate::school_name',
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          itemType: 'structured_field_candidate',
          fieldKey: 'school_name',
          pendingCount: 1,
          distinctValues: ['清华大学'],
          hasConflict: false,
          nextQueueItemId: 'rq-2',
          latestPendingCreatedAt: '2026-03-11T00:05:00.000Z'
        },
        {
          groupKey: 'cp-1::structured_field_candidate::birth_date',
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          itemType: 'structured_field_candidate',
          fieldKey: 'birth_date',
          pendingCount: 1,
          distinctValues: ['1990-01-01'],
          hasConflict: false,
          nextQueueItemId: 'rq-3',
          latestPendingCreatedAt: '2026-03-11T00:10:00.000Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          groupKey: 'cp-1::structured_field_candidate::birth_date',
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          itemType: 'structured_field_candidate',
          fieldKey: 'birth_date',
          pendingCount: 1,
          distinctValues: ['1990-01-01'],
          hasConflict: false,
          nextQueueItemId: 'rq-3',
          latestPendingCreatedAt: '2026-03-11T00:10:00.000Z'
        }
      ])

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
          hasConflict: true,
          createdAt: '2026-03-11T00:00:00.000Z',
          reviewedAt: null
        },
        {
          queueItemId: 'rq-2',
          itemType: 'structured_field_candidate',
          candidateId: 'fc-2',
          status: 'pending',
          priority: 0,
          confidence: 0.97,
          summary: { fieldKey: 'school_name' },
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'school_name',
          displayValue: '清华大学',
          hasConflict: true,
          createdAt: '2026-03-11T00:05:00.000Z',
          reviewedAt: null
        },
        {
          queueItemId: 'rq-3',
          itemType: 'structured_field_candidate',
          candidateId: 'fc-3',
          status: 'pending',
          priority: 0,
          confidence: 0.96,
          summary: { fieldKey: 'birth_date' },
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'birth_date',
          displayValue: '1990-01-01',
          hasConflict: false,
          createdAt: '2026-03-11T00:10:00.000Z',
          reviewedAt: null
        }
      ])
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
          hasConflict: true,
          createdAt: '2026-03-11T00:00:00.000Z',
          reviewedAt: null
        },
        {
          queueItemId: 'rq-2',
          itemType: 'structured_field_candidate',
          candidateId: 'fc-2',
          status: 'pending',
          priority: 0,
          confidence: 0.97,
          summary: { fieldKey: 'school_name' },
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'school_name',
          displayValue: '清华大学',
          hasConflict: true,
          createdAt: '2026-03-11T00:05:00.000Z',
          reviewedAt: null
        },
        {
          queueItemId: 'rq-3',
          itemType: 'structured_field_candidate',
          candidateId: 'fc-3',
          status: 'pending',
          priority: 0,
          confidence: 0.96,
          summary: { fieldKey: 'birth_date' },
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'birth_date',
          displayValue: '1990-01-01',
          hasConflict: false,
          createdAt: '2026-03-11T00:10:00.000Z',
          reviewedAt: null
        }
      ])
      .mockResolvedValueOnce([
        {
          queueItemId: 'rq-2',
          itemType: 'structured_field_candidate',
          candidateId: 'fc-2',
          status: 'pending',
          priority: 0,
          confidence: 0.97,
          summary: { fieldKey: 'school_name' },
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'school_name',
          displayValue: '清华大学',
          hasConflict: false,
          createdAt: '2026-03-11T00:05:00.000Z',
          reviewedAt: null
        },
        {
          queueItemId: 'rq-3',
          itemType: 'structured_field_candidate',
          candidateId: 'fc-3',
          status: 'pending',
          priority: 0,
          confidence: 0.96,
          summary: { fieldKey: 'birth_date' },
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'birth_date',
          displayValue: '1990-01-01',
          hasConflict: false,
          createdAt: '2026-03-11T00:10:00.000Z',
          reviewedAt: null
        }
      ])
      .mockResolvedValueOnce([
        {
          queueItemId: 'rq-3',
          itemType: 'structured_field_candidate',
          candidateId: 'fc-3',
          status: 'pending',
          priority: 0,
          confidence: 0.96,
          summary: { fieldKey: 'birth_date' },
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'birth_date',
          displayValue: '1990-01-01',
          hasConflict: false,
          createdAt: '2026-03-11T00:10:00.000Z',
          reviewedAt: null
        }
      ])

    const getReviewWorkbenchItem = vi.fn().mockImplementation(async (queueItemId: string) => ({
      item: {
        queueItemId,
        itemType: 'structured_field_candidate',
        candidateId: queueItemId.replace('rq', 'fc'),
        status: 'pending',
        priority: 0,
        confidence: 0.98,
        summary: { fieldKey: queueItemId === 'rq-3' ? 'birth_date' : 'school_name' },
        canonicalPersonId: 'cp-1',
        canonicalPersonName: 'Alice Chen',
        fieldKey: queueItemId === 'rq-3' ? 'birth_date' : 'school_name',
        displayValue: queueItemId === 'rq-1' ? '北京大学' : queueItemId === 'rq-2' ? '清华大学' : '1990-01-01',
        hasConflict: queueItemId !== 'rq-3',
        createdAt: '2026-03-11T00:00:00.000Z',
        reviewedAt: null
      },
      queueItem: {
        id: queueItemId,
        itemType: 'structured_field_candidate',
        candidateId: queueItemId.replace('rq', 'fc'),
        status: 'pending',
        priority: 0,
        confidence: 0.98,
        summary: { fieldKey: queueItemId === 'rq-3' ? 'birth_date' : 'school_name' },
        createdAt: '2026-03-11T00:00:00.000Z',
        reviewedAt: null
      },
      candidate: {
        id: queueItemId.replace('rq', 'fc'),
        fileId: 'f-1',
        jobId: 'job-1',
        fieldType: 'education',
        fieldKey: queueItemId === 'rq-3' ? 'birth_date' : 'school_name',
        fieldValue: queueItemId === 'rq-1' ? '北京大学' : queueItemId === 'rq-2' ? '清华大学' : '1990-01-01',
        documentType: 'transcript',
        confidence: 0.98,
        riskLevel: 'high',
        sourcePage: 1,
        status: 'pending',
        createdAt: '2026-03-11T00:00:00.000Z',
        reviewedAt: null,
        reviewNote: null,
        queueItemId
      },
      trace: {
        queueItem: {
          id: queueItemId,
          itemType: 'structured_field_candidate',
          candidateId: queueItemId.replace('rq', 'fc'),
          status: 'pending',
          priority: 0,
          confidence: 0.98,
          summary: { fieldKey: queueItemId === 'rq-3' ? 'birth_date' : 'school_name' },
          createdAt: '2026-03-11T00:00:00.000Z',
          reviewedAt: null
        },
        candidate: null,
        sourceFile: { fileId: 'f-1', fileName: 'transcript.pdf', batchId: 'b-1', fileKind: '.pdf' },
        sourceEvidence: { evidenceId: 'ee-1', evidenceType: 'approved_structured_field', status: 'approved', riskLevel: 'high', payloadJson: '{}', fileId: 'f-1', jobId: 'job-1' },
        sourceCandidate: null,
        sourceJournal: null
      },
      impactPreview: {
        approveImpact: { kind: 'project_formal_attribute', summary: 'Approving creates a formal profile attribute.', canonicalPersonId: 'cp-1', canonicalPersonName: 'Alice Chen', fieldKey: queueItemId === 'rq-3' ? 'birth_date' : 'school_name', nextValue: queueItemId === 'rq-1' ? '北京大学' : queueItemId === 'rq-2' ? '清华大学' : '1990-01-01', currentValue: null, sourceEvidenceId: null, sourceCandidateId: queueItemId.replace('rq', 'fc'), relatedJournalId: null },
        rejectImpact: { kind: 'reject_review_item', summary: 'Rejecting blocks projection.', canonicalPersonId: 'cp-1', sourceEvidenceId: null, sourceCandidateId: queueItemId.replace('rq', 'fc') },
        undoImpact: { kind: 'no_approved_decision', summary: 'Nothing to undo yet.', canonicalPersonId: 'cp-1', affectedJournalId: null, affectedAttributeIds: [] }
      },
      currentProfileAttributes: []
    }))

    vi.stubGlobal('window', {
      archiveApi: {
        listReviewInboxPeople,
        listReviewConflictGroups,
        listReviewWorkbenchItems,
        getReviewWorkbenchItem,
        approveReviewItem,
        rejectReviewItem,
        undoDecision
      }
    })

    render(<ReviewWorkbenchPage />)

    await screen.findByRole('button', { name: 'Approve' })
    fireEvent.click(screen.getByRole('button', { name: 'school_name' }))
    expect(await screen.findByRole('button', { name: '北京大学' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清华大学' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1990-01-01' })).not.toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    })

    expect(approveReviewItem).toHaveBeenCalledWith('rq-1')
    expect(getReviewWorkbenchItem).toHaveBeenLastCalledWith('rq-2')
    expect(await screen.findByRole('button', { name: '清华大学' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    })

    expect(approveReviewItem).toHaveBeenCalledWith('rq-2')
    expect(getReviewWorkbenchItem).toHaveBeenLastCalledWith('rq-3')
    expect(await screen.findByRole('button', { name: '1990-01-01' })).toBeInTheDocument()
    expect(rejectReviewItem).not.toHaveBeenCalled()
    expect(undoDecision).not.toHaveBeenCalled()
  })
})
