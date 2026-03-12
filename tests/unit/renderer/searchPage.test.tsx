import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchPage } from '../../../src/renderer/pages/SearchPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SearchPage', () => {
  it('renders file and decision journal results from the same keyword search', async () => {
    const searchArchive = vi.fn().mockResolvedValue([
      {
        fileId: 'file-1',
        batchId: 'batch-1',
        fileName: 'sample-chat.txt',
        fileKind: 'chat',
        duplicateClass: 'unique',
        parserStatus: 'parsed',
        matchedPeople: ['Alice Chen']
      }
    ])
    const searchDecisionJournal = vi.fn().mockResolvedValue([
      {
        journalId: 'journal-batch-1',
        decisionType: 'approve_safe_review_group',
        targetType: 'decision_batch',
        decisionLabel: 'Safe batch approve',
        targetLabel: 'Alice Chen · school_name · 2 items',
        replaySummary: 'Safe batch approve · Alice Chen · school_name · 2 items',
        actor: 'reviewer',
        createdAt: '2026-03-12T00:00:00.000Z',
        undoneAt: null
      }
    ])

    vi.stubGlobal('window', {
      archiveApi: {
        searchArchive,
        searchDecisionJournal
      }
    })

    render(<SearchPage />)

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Keyword'), { target: { value: 'Alice' } })
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    })

    expect(searchArchive).toHaveBeenCalledWith({ query: 'Alice', fileKinds: [] })
    expect(searchDecisionJournal).toHaveBeenCalledWith({ query: 'Alice' })
    expect(await screen.findByText('sample-chat.txt')).toBeInTheDocument()
    expect(screen.getByText('Safe batch approve · Alice Chen · school_name · 2 items')).toBeInTheDocument()
  })
})
