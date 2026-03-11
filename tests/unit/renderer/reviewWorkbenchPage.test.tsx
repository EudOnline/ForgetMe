import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewWorkbenchPage } from '../../../src/renderer/pages/ReviewWorkbenchPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

function buildWorkbenchDetail(input: {
  queueItemId: string
  candidateId: string
  canonicalPersonId: string
  canonicalPersonName: string
  fieldKey: string
  displayValue: string
  fileName: string
}) {
  return {
    item: {
      queueItemId: input.queueItemId,
      itemType: 'structured_field_candidate' as const,
      candidateId: input.candidateId,
      status: 'pending',
      priority: 0,
      confidence: 0.98,
      summary: { fieldKey: input.fieldKey },
      canonicalPersonId: input.canonicalPersonId,
      canonicalPersonName: input.canonicalPersonName,
      fieldKey: input.fieldKey,
      displayValue: input.displayValue,
      hasConflict: false,
      createdAt: '2026-03-11T00:00:00.000Z',
      reviewedAt: null
    },
    queueItem: {
      id: input.queueItemId,
      itemType: 'structured_field_candidate',
      candidateId: input.candidateId,
      status: 'pending',
      priority: 0,
      confidence: 0.98,
      summary: { fieldKey: input.fieldKey },
      createdAt: '2026-03-11T00:00:00.000Z',
      reviewedAt: null
    },
    candidate: {
      id: input.candidateId,
      fileId: 'f-1',
      jobId: 'job-1',
      fieldType: 'education',
      fieldKey: input.fieldKey,
      fieldValue: input.displayValue,
      documentType: 'transcript',
      confidence: 0.98,
      riskLevel: 'high',
      sourcePage: 1,
      status: 'pending',
      createdAt: '2026-03-11T00:00:00.000Z',
      reviewedAt: null,
      reviewNote: null,
      queueItemId: input.queueItemId
    },
    trace: {
      queueItem: {
        id: input.queueItemId,
        itemType: 'structured_field_candidate',
        candidateId: input.candidateId,
        status: 'pending',
        priority: 0,
        confidence: 0.98,
        summary: { fieldKey: input.fieldKey },
        createdAt: '2026-03-11T00:00:00.000Z',
        reviewedAt: null
      },
      candidate: null,
      sourceFile: { fileId: 'f-1', fileName: input.fileName, batchId: 'b-1', fileKind: '.pdf' },
      sourceEvidence: { evidenceId: 'ee-1', evidenceType: 'approved_structured_field', status: 'approved', riskLevel: 'high', payloadJson: '{}', fileId: 'f-1', jobId: 'job-1' },
      sourceCandidate: null,
      sourceJournal: null
    },
    impactPreview: {
      approveImpact: { kind: 'project_formal_attribute', summary: 'Approving creates a formal profile attribute.', canonicalPersonId: input.canonicalPersonId, canonicalPersonName: input.canonicalPersonName, fieldKey: input.fieldKey, nextValue: input.displayValue, currentValue: null, sourceEvidenceId: null, sourceCandidateId: input.candidateId, relatedJournalId: null },
      rejectImpact: { kind: 'reject_review_item', summary: 'Rejecting blocks projection.', canonicalPersonId: input.canonicalPersonId, sourceEvidenceId: null, sourceCandidateId: input.candidateId },
      undoImpact: { kind: 'no_approved_decision', summary: 'Nothing to undo yet.', canonicalPersonId: input.canonicalPersonId, affectedJournalId: null, affectedAttributeIds: [] }
    },
    currentProfileAttributes: []
  }
}

describe('ReviewWorkbenchPage', () => {
  it('shows candidate detail, source evidence, and impact preview', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listReviewInboxPeople: vi.fn().mockResolvedValue([
          {
            canonicalPersonId: 'cp-1',
            canonicalPersonName: 'Alice Chen',
            pendingCount: 1,
            conflictCount: 0,
            fieldKeys: ['school_name'],
            itemTypes: ['structured_field_candidate'],
            nextQueueItemId: 'rq-1',
            latestPendingCreatedAt: '2026-03-11T00:00:00.000Z',
            hasContinuousSequence: false
          }
        ]),
        listReviewConflictGroups: vi.fn().mockResolvedValue([
          {
            groupKey: 'cp-1::structured_field_candidate::school_name',
            canonicalPersonId: 'cp-1',
            canonicalPersonName: 'Alice Chen',
            itemType: 'structured_field_candidate',
            fieldKey: 'school_name',
            pendingCount: 1,
            distinctValues: ['北京大学'],
            hasConflict: false,
            nextQueueItemId: 'rq-1',
            latestPendingCreatedAt: '2026-03-11T00:00:00.000Z'
          }
        ]),
        listReviewWorkbenchItems: vi.fn().mockResolvedValue([
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
        ]),
        getReviewWorkbenchItem: vi.fn().mockResolvedValue(buildWorkbenchDetail({
          queueItemId: 'rq-1',
          candidateId: 'fc-1',
          canonicalPersonId: 'cp-1',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'school_name',
          displayValue: '北京大学',
          fileName: 'transcript.pdf'
        }))
      }
    })

    render(<ReviewWorkbenchPage />)

    expect((await screen.findAllByText('北京大学')).length).toBeGreaterThan(0)
    expect(await screen.findByText('transcript.pdf')).toBeInTheDocument()
    expect(await screen.findByText('project_formal_attribute')).toBeInTheDocument()
  })

  it('shows conflict groups and filters workbench items by selected group', async () => {
    const getReviewWorkbenchItem = vi.fn().mockImplementation(async (queueItemId: string) => {
      if (queueItemId === 'rq-a1') {
        return buildWorkbenchDetail({
          queueItemId: 'rq-a1',
          candidateId: 'fc-a1',
          canonicalPersonId: 'cp-a',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'school_name',
          displayValue: '北京大学',
          fileName: 'alice-transcript-a.pdf'
        })
      }

      if (queueItemId === 'rq-a2') {
        return buildWorkbenchDetail({
          queueItemId: 'rq-a2',
          candidateId: 'fc-a2',
          canonicalPersonId: 'cp-a',
          canonicalPersonName: 'Alice Chen',
          fieldKey: 'school_name',
          displayValue: '清华大学',
          fileName: 'alice-transcript-b.pdf'
        })
      }

      return buildWorkbenchDetail({
        queueItemId: 'rq-a3',
        candidateId: 'fc-a3',
        canonicalPersonId: 'cp-a',
        canonicalPersonName: 'Alice Chen',
        fieldKey: 'birth_date',
        displayValue: '1990-01-01',
        fileName: 'alice-id.pdf'
      })
    })

    vi.stubGlobal('window', {
      archiveApi: {
        listReviewInboxPeople: vi.fn().mockResolvedValue([
          {
            canonicalPersonId: 'cp-a',
            canonicalPersonName: 'Alice Chen',
            pendingCount: 3,
            conflictCount: 2,
            fieldKeys: ['birth_date', 'school_name'],
            itemTypes: ['structured_field_candidate'],
            nextQueueItemId: 'rq-a1',
            latestPendingCreatedAt: '2026-03-11T01:00:00.000Z',
            hasContinuousSequence: true
          }
        ]),
        listReviewConflictGroups: vi.fn().mockResolvedValue([
          {
            groupKey: 'cp-a::structured_field_candidate::school_name',
            canonicalPersonId: 'cp-a',
            canonicalPersonName: 'Alice Chen',
            itemType: 'structured_field_candidate',
            fieldKey: 'school_name',
            pendingCount: 2,
            distinctValues: ['北京大学', '清华大学'],
            hasConflict: true,
            nextQueueItemId: 'rq-a1',
            latestPendingCreatedAt: '2026-03-11T00:05:00.000Z'
          },
          {
            groupKey: 'cp-a::structured_field_candidate::birth_date',
            canonicalPersonId: 'cp-a',
            canonicalPersonName: 'Alice Chen',
            itemType: 'structured_field_candidate',
            fieldKey: 'birth_date',
            pendingCount: 1,
            distinctValues: ['1990-01-01'],
            hasConflict: false,
            nextQueueItemId: 'rq-a3',
            latestPendingCreatedAt: '2026-03-11T01:00:00.000Z'
          }
        ]),
        listReviewWorkbenchItems: vi.fn().mockResolvedValue([
          {
            queueItemId: 'rq-a1',
            itemType: 'structured_field_candidate',
            candidateId: 'fc-a1',
            status: 'pending',
            priority: 0,
            confidence: 0.98,
            summary: { fieldKey: 'school_name' },
            canonicalPersonId: 'cp-a',
            canonicalPersonName: 'Alice Chen',
            fieldKey: 'school_name',
            displayValue: '北京大学',
            hasConflict: true,
            createdAt: '2026-03-11T00:00:00.000Z',
            reviewedAt: null
          },
          {
            queueItemId: 'rq-a2',
            itemType: 'structured_field_candidate',
            candidateId: 'fc-a2',
            status: 'pending',
            priority: 0,
            confidence: 0.97,
            summary: { fieldKey: 'school_name' },
            canonicalPersonId: 'cp-a',
            canonicalPersonName: 'Alice Chen',
            fieldKey: 'school_name',
            displayValue: '清华大学',
            hasConflict: true,
            createdAt: '2026-03-11T00:05:00.000Z',
            reviewedAt: null
          },
          {
            queueItemId: 'rq-a3',
            itemType: 'structured_field_candidate',
            candidateId: 'fc-a3',
            status: 'pending',
            priority: 0,
            confidence: 0.96,
            summary: { fieldKey: 'birth_date' },
            canonicalPersonId: 'cp-a',
            canonicalPersonName: 'Alice Chen',
            fieldKey: 'birth_date',
            displayValue: '1990-01-01',
            hasConflict: false,
            createdAt: '2026-03-11T01:00:00.000Z',
            reviewedAt: null
          }
        ]),
        getReviewWorkbenchItem,
        approveReviewItem: vi.fn(),
        rejectReviewItem: vi.fn(),
        undoDecision: vi.fn()
      }
    })

    render(<ReviewWorkbenchPage />)

    expect(await screen.findByText('Conflict Groups')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'school_name' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'birth_date' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'school_name' }))

    expect(await screen.findByRole('button', { name: '北京大学' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '清华大学' })).toBeInTheDocument()
    expect(getReviewWorkbenchItem).toHaveBeenLastCalledWith('rq-a1')
    expect(screen.queryByRole('button', { name: '1990-01-01' })).not.toBeInTheDocument()
  })
})
