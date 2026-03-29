import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from './testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportPage } from '../../../src/renderer/pages/ImportPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ImportPage', () => {
  it('shows the import action and latest batches', () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn()
      }
    })

    render(<ImportPage />)

    expect(screen.getByText('Import Batch')).toBeInTheDocument()
    expect(screen.getByText('Recent Batches')).toBeInTheDocument()
  })

  it('shows selected files, supported formats, and drag-active state in the import surface', () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn()
      }
    })

    render(<ImportPage />)
    expect(screen.getByText('Choose Files')).toBeInTheDocument()
    expect(screen.getByText('JSON, TXT, JPG, PNG, HEIC, PDF, DOCX')).toBeInTheDocument()
  })

  it('shows unsupported file guidance when selected files are skipped', async () => {
    const createImportBatch = vi.fn().mockResolvedValue({
      batchId: 'batch-unsupported-1',
      sourceLabel: 'unsupported.exe',
      createdAt: '2026-03-18T12:00:00.000Z',
      files: [
        {
          fileId: 'file-unsupported-1',
          fileName: 'unsupported.exe',
          duplicateClass: 'unique',
          parserStatus: 'failed',
          frozenAbsolutePath: '/tmp/frozen-unsupported.exe'
        }
      ]
    })

    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn().mockResolvedValue(['/tmp/unsupported.exe']),
        createImportBatch
      }
    })

    render(<ImportPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose Files' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This file type is not supported and was skipped.')
    expect(alert).toHaveTextContent('unsupported.exe')
    expect(createImportBatch).toHaveBeenCalled()
  })

  it('shows files-skipped guidance when a supported file fails parsing after batch creation', async () => {
    const createImportBatch = vi.fn().mockResolvedValue({
      batchId: 'batch-parse-failed-1',
      sourceLabel: 'chat.txt',
      createdAt: '2026-03-20T08:00:00.000Z',
      files: [
        {
          fileId: 'file-parse-failed-1',
          fileName: 'chat.txt',
          duplicateClass: 'unique',
          parserStatus: 'failed',
          frozenAbsolutePath: '/tmp/frozen-chat.txt'
        }
      ]
    })

    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn().mockResolvedValue(['/tmp/chat.txt']),
        createImportBatch
      }
    })

    render(<ImportPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose Files' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Some files could not be imported and were skipped.')
    expect(alert).toHaveTextContent('chat.txt')
    expect(createImportBatch).toHaveBeenCalled()
  })

  it('shows a safe import failure summary with raw error detail', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn().mockResolvedValue(['/tmp/chat.txt']),
        createImportBatch: vi.fn().mockRejectedValue(new Error('EACCES: permission denied, open /tmp/chat.txt'))
      }
    })

    render(<ImportPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose Files' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Some files could not be imported and were skipped.')
    expect(alert).toHaveTextContent('EACCES: permission denied, open /tmp/chat.txt')
  })
})
