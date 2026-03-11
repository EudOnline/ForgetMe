import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewWorkbenchPage } from '../../../src/renderer/pages/ReviewWorkbenchPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReviewWorkbenchPage', () => {
  it('shows candidate detail, source evidence, and impact preview', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
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
        getReviewWorkbenchItem: vi.fn().mockResolvedValue({
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
            id: 'rq-1',
            itemType: 'structured_field_candidate',
            candidateId: 'fc-1',
            status: 'pending',
            priority: 0,
            confidence: 0.98,
            summary: { fieldKey: 'school_name' },
            createdAt: '2026-03-11T00:00:00.000Z',
            reviewedAt: null
          },
          candidate: {
            id: 'fc-1',
            fileId: 'f-1',
            jobId: 'job-1',
            fieldType: 'education',
            fieldKey: 'school_name',
            fieldValue: '北京大学',
            documentType: 'transcript',
            confidence: 0.98,
            riskLevel: 'high',
            sourcePage: 1,
            status: 'pending',
            createdAt: '2026-03-11T00:00:00.000Z',
            reviewedAt: null,
            reviewNote: null,
            queueItemId: 'rq-1'
          },
          trace: {
            queueItem: {
              id: 'rq-1',
              itemType: 'structured_field_candidate',
              candidateId: 'fc-1',
              status: 'pending',
              priority: 0,
              confidence: 0.98,
              summary: { fieldKey: 'school_name' },
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
            approveImpact: { kind: 'project_formal_attribute', summary: 'Approving creates a formal profile attribute.', canonicalPersonId: 'cp-1', canonicalPersonName: 'Alice Chen', fieldKey: 'school_name', nextValue: '北京大学', currentValue: null, sourceEvidenceId: null, sourceCandidateId: 'fc-1', relatedJournalId: null },
            rejectImpact: { kind: 'reject_review_item', summary: 'Rejecting blocks projection.', canonicalPersonId: 'cp-1', sourceEvidenceId: null, sourceCandidateId: 'fc-1' },
            undoImpact: { kind: 'no_approved_decision', summary: 'Nothing to undo yet.', canonicalPersonId: 'cp-1', affectedJournalId: null, affectedAttributeIds: [] }
          },
          currentProfileAttributes: []
        })
      }
    })

    render(<ReviewWorkbenchPage />)

    expect((await screen.findAllByText('北京大学')).length).toBeGreaterThan(0)
    expect(await screen.findByText('transcript.pdf')).toBeInTheDocument()
    expect(await screen.findByText('project_formal_attribute')).toBeInTheDocument()
  })
})
