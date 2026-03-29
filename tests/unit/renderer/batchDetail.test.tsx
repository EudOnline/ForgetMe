import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen } from './testing-library'
import { BatchDetail } from '../../../src/renderer/components/BatchDetail'

describe('BatchDetail', () => {
  it('surfaces duplicate and skipped file statuses with operator-friendly labels', () => {
    render(
      <BatchDetail
        batch={{
          batchId: 'batch-dirty-data-1',
          sourceLabel: 'dirty-data-test',
          createdAt: '2026-03-26T08:00:00.000Z',
          summary: {
            frozenCount: 4,
            parsedCount: 3,
            duplicateCount: 1,
            reviewCount: 1
          },
          files: [
            {
              fileId: 'file-1',
              fileName: 'duplicate-chat-a.json',
              duplicateClass: 'unique',
              parserStatus: 'parsed',
              frozenAbsolutePath: '/tmp/duplicate-chat-a.json'
            },
            {
              fileId: 'file-2',
              fileName: 'duplicate-chat-b.json',
              duplicateClass: 'duplicate_exact',
              parserStatus: 'parsed',
              frozenAbsolutePath: '/tmp/duplicate-chat-b.json'
            },
            {
              fileId: 'file-3',
              fileName: 'fixture-unsupported.exe',
              duplicateClass: 'unique',
              parserStatus: 'failed',
              frozenAbsolutePath: '/tmp/fixture-unsupported.exe'
            }
          ]
        }}
      />
    )

    expect(screen.getByText('Exact duplicates')).toBeInTheDocument()
    expect(screen.getByText('Skipped imports')).toBeInTheDocument()
    expect(screen.getByText('Batch Summary')).toBeInTheDocument()
    expect(screen.getByText('Imported: 4')).toBeInTheDocument()
    expect(screen.getByText('Parsed: 3')).toBeInTheDocument()
    expect(screen.getByText('Duplicates: 1')).toBeInTheDocument()
    expect(screen.getByText('Review Queue: 1')).toBeInTheDocument()
    expect(screen.getByText('duplicate-chat-b.json')).toBeInTheDocument()
    expect(screen.getByText('fixture-unsupported.exe')).toBeInTheDocument()
  })
})
