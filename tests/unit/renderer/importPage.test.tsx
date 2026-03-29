import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from './testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportPage } from '../../../src/renderer/pages/ImportPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ImportPage', () => {
  function makeFileWithPath(fileName: string, filePath: string, fileType = 'application/octet-stream') {
    const file = new File(['file-body'], fileName, { type: fileType })
    Object.defineProperty(file, 'path', { value: filePath, configurable: true })
    return file
  }

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

  it('updates selected file rows and count from dropped files', () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn()
      }
    })

    render(<ImportPage />)

    const dropSurface = screen.getByText('Import Workbench').closest('.fmImportDropzoneSurface')
    expect(dropSurface).not.toBeNull()

    const droppedFile = makeFileWithPath('queue-chat.json', '/tmp/queue-chat.json', 'application/json')
    fireEvent.drop(dropSurface as HTMLElement, {
      dataTransfer: {
        files: [droppedFile]
      }
    })

    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.getByText('queue-chat.json')).toBeInTheDocument()
  })

  it('supports remove-one and clear-all actions on queued files', () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn()
      }
    })

    render(<ImportPage />)

    const dropSurface = screen.getByText('Import Workbench').closest('.fmImportDropzoneSurface')
    expect(dropSurface).not.toBeNull()

    const fileOne = makeFileWithPath('one.txt', '/tmp/one.txt', 'text/plain')
    const fileTwo = makeFileWithPath('two.txt', '/tmp/two.txt', 'text/plain')
    fireEvent.drop(dropSurface as HTMLElement, {
      dataTransfer: {
        files: [fileOne, fileTwo]
      }
    })

    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear Selection' }))
    expect(screen.getByText('0 selected')).toBeInTheDocument()
    expect(screen.getByText('No files selected yet.')).toBeInTheDocument()
  })

  it('does not start batch creation on drop alone', () => {
    const createImportBatch = vi.fn()
    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn(),
        createImportBatch
      }
    })

    render(<ImportPage />)

    const dropSurface = screen.getByText('Import Workbench').closest('.fmImportDropzoneSurface')
    expect(dropSurface).not.toBeNull()

    const droppedFile = makeFileWithPath('queued.pdf', '/tmp/queued.pdf', 'application/pdf')
    fireEvent.drop(dropSurface as HTMLElement, {
      dataTransfer: {
        files: [droppedFile]
      }
    })

    expect(createImportBatch).not.toHaveBeenCalled()
  })

  it('uses queued selection for import confirmation without reopening picker when queue exists', async () => {
    const createImportBatch = vi.fn().mockResolvedValue({
      batchId: 'batch-queued-1',
      sourceLabel: 'queued.json',
      createdAt: '2026-03-29T00:00:00.000Z',
      files: [
        {
          fileId: 'file-queued-1',
          fileName: 'queued.json',
          duplicateClass: 'unique',
          parserStatus: 'parsed',
          frozenAbsolutePath: '/tmp/queued.json'
        }
      ]
    })
    const selectImportFiles = vi.fn().mockResolvedValue(['/tmp/from-picker.json'])

    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles,
        createImportBatch
      }
    })

    render(<ImportPage />)

    const dropSurface = screen.getByText('Import Workbench').closest('.fmImportDropzoneSurface')
    expect(dropSurface).not.toBeNull()

    const droppedFile = makeFileWithPath('queued.json', '/tmp/queued.json', 'application/json')
    fireEvent.drop(dropSurface as HTMLElement, {
      dataTransfer: {
        files: [droppedFile]
      }
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose Files' }))
      await Promise.resolve()
    })
    expect(createImportBatch).toHaveBeenCalledWith({
      sourcePaths: ['/tmp/queued.json'],
      sourceLabel: 'queued.json'
    })
    expect(selectImportFiles).not.toHaveBeenCalled()
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
