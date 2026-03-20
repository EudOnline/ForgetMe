import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewWorkbenchPage } from '../../../src/renderer/pages/ReviewWorkbenchPage'

afterEach(() => {
  Reflect.deleteProperty(window, 'archiveApi')
  vi.unstubAllGlobals()
})

function installArchiveApi(archiveApi: unknown) {
  window.archiveApi = archiveApi as Window['archiveApi']
}

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

function buildProfileWorkbenchDetail(input: {
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
      itemType: 'profile_attribute_candidate' as const,
      candidateId: input.candidateId,
      status: 'pending',
      priority: 0,
      confidence: 0.95,
      summary: { attributeKey: input.fieldKey },
      canonicalPersonId: input.canonicalPersonId,
      canonicalPersonName: input.canonicalPersonName,
      fieldKey: input.fieldKey,
      displayValue: input.displayValue,
      hasConflict: false,
      createdAt: '2026-03-12T00:00:00.000Z',
      reviewedAt: null
    },
    queueItem: {
      id: input.queueItemId,
      itemType: 'profile_attribute_candidate',
      candidateId: input.candidateId,
      status: 'pending',
      priority: 0,
      confidence: 0.95,
      summary: { attributeKey: input.fieldKey },
      createdAt: '2026-03-12T00:00:00.000Z',
      reviewedAt: null
    },
    candidate: {
      id: input.candidateId,
      proposedCanonicalPersonId: input.canonicalPersonId,
      sourceFileId: 'f-1',
      sourceEvidenceId: 'ee-1',
      sourceCandidateId: 'fc-1',
      attributeGroup: 'education',
      attributeKey: input.fieldKey,
      valueJson: JSON.stringify({ value: input.displayValue }),
      displayValue: input.displayValue,
      proposalBasis: { matchedRule: 'single_file_person' },
      reasonCode: 'singleton_conflict',
      confidence: 0.95,
      status: 'pending',
      createdAt: '2026-03-12T00:00:00.000Z',
      reviewedAt: null,
      reviewNote: null,
      approvedJournalId: null,
      queueItemId: input.queueItemId
    },
    trace: {
      queueItem: {
        id: input.queueItemId,
        itemType: 'profile_attribute_candidate',
        candidateId: input.candidateId,
        status: 'pending',
        priority: 0,
        confidence: 0.95,
        summary: { attributeKey: input.fieldKey },
        createdAt: '2026-03-12T00:00:00.000Z',
        reviewedAt: null
      },
      candidate: null,
      sourceFile: { fileId: 'f-1', fileName: input.fileName, batchId: 'b-1', fileKind: '.pdf' },
      sourceEvidence: { evidenceId: 'ee-1', evidenceType: 'approved_structured_field', status: 'approved', riskLevel: 'high', payloadJson: '{}', fileId: 'f-1', jobId: 'job-1' },
      sourceCandidate: { candidateId: 'fc-1', candidateType: 'structured_field_candidate', status: 'approved' },
      sourceJournal: null
    },
    impactPreview: {
      approveImpact: { kind: 'project_formal_attribute', summary: 'Approving creates a formal profile attribute.', canonicalPersonId: input.canonicalPersonId, canonicalPersonName: input.canonicalPersonName, fieldKey: input.fieldKey, nextValue: input.displayValue, currentValue: null, sourceEvidenceId: 'ee-1', sourceCandidateId: input.candidateId, relatedJournalId: null },
      rejectImpact: { kind: 'reject_review_item', summary: 'Rejecting blocks projection.', canonicalPersonId: input.canonicalPersonId, sourceEvidenceId: 'ee-1', sourceCandidateId: input.candidateId },
      undoImpact: { kind: 'no_approved_decision', summary: 'Nothing to undo yet.', canonicalPersonId: input.canonicalPersonId, affectedJournalId: null, affectedAttributeIds: [] }
    },
    currentProfileAttributes: []
  }
}

describe('ReviewWorkbenchPage', () => {
  it('shows candidate detail, source evidence, and impact preview', async () => {
    installArchiveApi({
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
    })

    render(<ReviewWorkbenchPage />)

    expect((await screen.findAllByText('北京大学')).length).toBeGreaterThan(0)
    expect(await screen.findByText('transcript.pdf')).toBeInTheDocument()
    expect(await screen.findByText('project_formal_attribute')).toBeInTheDocument()
  })

  it('shows conflict compare details and supports button plus keyboard navigation inside the selected group', async () => {
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

      return buildWorkbenchDetail({
        queueItemId: 'rq-a2',
        candidateId: 'fc-a2',
        canonicalPersonId: 'cp-a',
        canonicalPersonName: 'Alice Chen',
        fieldKey: 'school_name',
        displayValue: '清华大学',
        fileName: 'alice-transcript-b.pdf'
      })
    })

    installArchiveApi({
      listReviewInboxPeople: vi.fn().mockResolvedValue([
        {
          canonicalPersonId: 'cp-a',
          canonicalPersonName: 'Alice Chen',
          pendingCount: 2,
          conflictCount: 2,
          fieldKeys: ['school_name'],
          itemTypes: ['structured_field_candidate'],
          nextQueueItemId: 'rq-a1',
          latestPendingCreatedAt: '2026-03-11T00:05:00.000Z',
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
        }
      ]),
      getReviewWorkbenchItem,
      approveReviewItem: vi.fn(),
      approveSafeReviewGroup: vi.fn(),
      rejectReviewItem: vi.fn(),
      undoDecision: vi.fn()
    })

    render(<ReviewWorkbenchPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'school_name' }))

    expect(await screen.findByText('Conflict Compare')).toBeInTheDocument()
    expect(await screen.findByText('2 values')).toBeInTheDocument()
    expect(await screen.findByText('北京大学 · 1')).toBeInTheDocument()
    expect(await screen.findByText('清华大学 · 1')).toBeInTheDocument()
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Batch Approve' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(getReviewWorkbenchItem).toHaveBeenLastCalledWith('rq-a2')
    expect(await screen.findByText('2 / 2')).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'k' })
    expect(getReviewWorkbenchItem).toHaveBeenLastCalledWith('rq-a1')
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'j' })
    expect(getReviewWorkbenchItem).toHaveBeenLastCalledWith('rq-a2')
    expect(await screen.findByText('2 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(getReviewWorkbenchItem).toHaveBeenLastCalledWith('rq-a1')
  })

  it('auto-selects the matching conflict group from the initial queue item', async () => {
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

      return buildWorkbenchDetail({
        queueItemId: 'rq-a2',
        candidateId: 'fc-a2',
        canonicalPersonId: 'cp-a',
        canonicalPersonName: 'Alice Chen',
        fieldKey: 'school_name',
        displayValue: '清华大学',
        fileName: 'alice-transcript-b.pdf'
      })
    })

    installArchiveApi({
      listReviewInboxPeople: vi.fn().mockResolvedValue([
        {
          canonicalPersonId: 'cp-a',
          canonicalPersonName: 'Alice Chen',
          pendingCount: 2,
          conflictCount: 2,
          fieldKeys: ['school_name'],
          itemTypes: ['structured_field_candidate'],
          nextQueueItemId: 'rq-a1',
          latestPendingCreatedAt: '2026-03-11T00:05:00.000Z',
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
        }
      ]),
      getReviewWorkbenchItem,
      approveReviewItem: vi.fn(),
      approveSafeReviewGroup: vi.fn(),
      rejectReviewItem: vi.fn(),
      undoDecision: vi.fn()
    })

    render(<ReviewWorkbenchPage initialQueueItemId="rq-a2" />)

    expect(await screen.findByText('Conflict Compare')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'school_name' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '清华大学' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('清华大学 · 1')).toBeInTheDocument()
  })

  it('shows safe batch approval for a no-conflict profile attribute group and confirms before execution', async () => {
    const approveSafeReviewGroup = vi.fn().mockResolvedValue({
      status: 'approved',
      batchId: 'batch-1',
      journalId: 'j-batch-1',
      groupKey: 'cp-1::profile_attribute_candidate::school_name',
      itemCount: 2,
      canonicalPersonId: 'cp-1',
      canonicalPersonName: 'Alice Chen',
      itemType: 'profile_attribute_candidate',
      fieldKey: 'school_name',
      queueItemIds: ['rq-p1', 'rq-p2']
    })

    const getReviewWorkbenchItem = vi.fn().mockResolvedValue(buildProfileWorkbenchDetail({
      queueItemId: 'rq-p1',
      candidateId: 'pac-1',
      canonicalPersonId: 'cp-1',
      canonicalPersonName: 'Alice Chen',
      fieldKey: 'school_name',
      displayValue: '北京大学',
      fileName: 'profile-1.pdf'
    }))

    installArchiveApi({
      listReviewInboxPeople: vi
        .fn()
        .mockResolvedValueOnce([
          {
            canonicalPersonId: 'cp-1',
            canonicalPersonName: 'Alice Chen',
            pendingCount: 2,
            conflictCount: 0,
            fieldKeys: ['school_name'],
            itemTypes: ['profile_attribute_candidate'],
            nextQueueItemId: 'rq-p1',
            latestPendingCreatedAt: '2026-03-12T00:00:00.000Z',
            hasContinuousSequence: true
          }
        ])
        .mockResolvedValueOnce([
          {
            canonicalPersonId: 'cp-1',
            canonicalPersonName: 'Alice Chen',
            pendingCount: 2,
            conflictCount: 0,
            fieldKeys: ['school_name'],
            itemTypes: ['profile_attribute_candidate'],
            nextQueueItemId: 'rq-p1',
            latestPendingCreatedAt: '2026-03-12T00:00:00.000Z',
            hasContinuousSequence: true
          }
        ])
        .mockResolvedValue([]),
      listReviewConflictGroups: vi
        .fn()
        .mockResolvedValueOnce([
          {
            groupKey: 'cp-1::profile_attribute_candidate::school_name',
            canonicalPersonId: 'cp-1',
            canonicalPersonName: 'Alice Chen',
            itemType: 'profile_attribute_candidate',
            fieldKey: 'school_name',
            pendingCount: 2,
            distinctValues: ['北京大学'],
            hasConflict: false,
            nextQueueItemId: 'rq-p1',
            latestPendingCreatedAt: '2026-03-12T00:00:00.000Z'
          }
        ])
        .mockResolvedValueOnce([
          {
            groupKey: 'cp-1::profile_attribute_candidate::school_name',
            canonicalPersonId: 'cp-1',
            canonicalPersonName: 'Alice Chen',
            itemType: 'profile_attribute_candidate',
            fieldKey: 'school_name',
            pendingCount: 2,
            distinctValues: ['北京大学'],
            hasConflict: false,
            nextQueueItemId: 'rq-p1',
            latestPendingCreatedAt: '2026-03-12T00:00:00.000Z'
          }
        ])
        .mockResolvedValue([]),
      listReviewWorkbenchItems: vi
        .fn()
        .mockResolvedValueOnce([
          {
            queueItemId: 'rq-p1',
            itemType: 'profile_attribute_candidate',
            candidateId: 'pac-1',
            status: 'pending',
            priority: 0,
            confidence: 0.95,
            summary: { attributeKey: 'school_name' },
            canonicalPersonId: 'cp-1',
            canonicalPersonName: 'Alice Chen',
            fieldKey: 'school_name',
            displayValue: '北京大学',
            hasConflict: false,
            createdAt: '2026-03-12T00:00:00.000Z',
            reviewedAt: null
          },
          {
            queueItemId: 'rq-p2',
            itemType: 'profile_attribute_candidate',
            candidateId: 'pac-2',
            status: 'pending',
            priority: 0,
            confidence: 0.94,
            summary: { attributeKey: 'school_name' },
            canonicalPersonId: 'cp-1',
            canonicalPersonName: 'Alice Chen',
            fieldKey: 'school_name',
            displayValue: '北京大学',
            hasConflict: false,
            createdAt: '2026-03-12T00:01:00.000Z',
            reviewedAt: null
          }
        ])
        .mockResolvedValueOnce([
          {
            queueItemId: 'rq-p1',
            itemType: 'profile_attribute_candidate',
            candidateId: 'pac-1',
            status: 'pending',
            priority: 0,
            confidence: 0.95,
            summary: { attributeKey: 'school_name' },
            canonicalPersonId: 'cp-1',
            canonicalPersonName: 'Alice Chen',
            fieldKey: 'school_name',
            displayValue: '北京大学',
            hasConflict: false,
            createdAt: '2026-03-12T00:00:00.000Z',
            reviewedAt: null
          },
          {
            queueItemId: 'rq-p2',
            itemType: 'profile_attribute_candidate',
            candidateId: 'pac-2',
            status: 'pending',
            priority: 0,
            confidence: 0.94,
            summary: { attributeKey: 'school_name' },
            canonicalPersonId: 'cp-1',
            canonicalPersonName: 'Alice Chen',
            fieldKey: 'school_name',
            displayValue: '北京大学',
            hasConflict: false,
            createdAt: '2026-03-12T00:01:00.000Z',
            reviewedAt: null
          }
        ])
        .mockResolvedValue([]),
      getReviewWorkbenchItem,
      approveReviewItem: vi.fn(),
      approveSafeReviewGroup,
      rejectReviewItem: vi.fn(),
      undoDecision: vi.fn()
    })

    render(<ReviewWorkbenchPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'school_name' }))

    expect(await screen.findByRole('button', { name: 'Batch Approve' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Batch Approve' }))
    expect(await screen.findByText('Safe Batch Approval')).toBeInTheDocument()
    expect(await screen.findByText('2 items')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Batch Approve' }))
    expect(approveSafeReviewGroup).toHaveBeenCalledWith({ groupKey: 'cp-1::profile_attribute_candidate::school_name' })
    expect(await screen.findByText('No conflict groups in current scope.')).toBeInTheDocument()
  })
})
