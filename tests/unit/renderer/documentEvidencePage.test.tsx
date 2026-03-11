import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumentEvidencePage } from '../../../src/renderer/pages/DocumentEvidencePage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DocumentEvidencePage', () => {
  it('shows OCR text and pending field candidates', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        getDocumentEvidence: vi.fn().mockResolvedValue({
          fileId: 'file-1',
          fileName: 'id-card.jpg',
          rawText: '姓名 张三',
          layoutBlocks: [{ page: 1, text: '姓名 张三' }],
          approvedFields: [],
          fieldCandidates: [{ id: 'fc-1', fileId: 'file-1', jobId: 'job-1', fieldType: 'identity', fieldKey: 'national_id_number', fieldValue: '123456', documentType: 'id_card', confidence: 0.98, riskLevel: 'high', sourcePage: 1, status: 'pending', createdAt: '2026-03-11T00:00:00.000Z', reviewedAt: null, reviewNote: null, queueItemId: 'rq-1' }]
        }),
        approveStructuredFieldCandidate: vi.fn().mockResolvedValue({ status: 'approved', queueItemId: 'rq-1', journalId: 'dj-1', candidateId: 'fc-1' }),
        rejectStructuredFieldCandidate: vi.fn().mockResolvedValue({ status: 'rejected', queueItemId: 'rq-1', journalId: 'dj-2', candidateId: 'fc-1' })
      }
    })

    render(<DocumentEvidencePage fileId="file-1" />)
    expect(await screen.findByText('姓名 张三')).toBeInTheDocument()
    expect(await screen.findByText('national_id_number')).toBeInTheDocument()
  })
})
