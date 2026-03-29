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

  function makePreflightItem(input: {
    fileName: string
    sourcePath: string
    status: 'supported' | 'unsupported' | 'duplicate_candidate'
    importKindHint?: 'chat' | 'image' | 'document' | 'unknown'
  }) {
    const extensionIndex = input.fileName.lastIndexOf('.')
    const extension = extensionIndex >= 0 ? input.fileName.slice(extensionIndex).toLowerCase() : ''

    return {
      sourcePath: input.sourcePath,
      fileName: input.fileName,
      extension,
      normalizedFileName: input.fileName.toLowerCase(),
      importKindHint: input.importKindHint ?? 'chat',
      isSupported: input.status !== 'unsupported',
      status: input.status
    }
  }

  function makePreflightResult(
    items: Array<ReturnType<typeof makePreflightItem>>
  ) {
    return {
      items,
      summary: {
        totalCount: items.length,
        supportedCount: items.filter((item) => item.isSupported).length,
        unsupportedCount: items.filter((item) => !item.isSupported).length
      }
    }
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
    expect(screen.getByText('JSON, TXT, JPG, JPEG, PNG, HEIC, PDF, DOCX')).toBeInTheDocument()

    const dropSurface = screen.getByText('Import Workbench').closest('.fmImportDropzoneSurface')
    expect(dropSurface).not.toBeNull()
    expect(dropSurface).toHaveAttribute('data-drag-active', 'false')

    fireEvent.dragEnter(dropSurface as HTMLElement)
    expect(dropSurface).toHaveAttribute('data-drag-active', 'true')
    expect(screen.getByText('Release to add files to this import selection.')).toBeInTheDocument()

    fireEvent.dragLeave(dropSurface as HTMLElement)
    expect(dropSurface).toHaveAttribute('data-drag-active', 'false')
    expect(screen.getByText('Drag files here to queue them before import.')).toBeInTheDocument()
  })

  it('updates selected file rows and count from dropped files', async () => {
    const preflightImportBatch = vi.fn().mockResolvedValue(
      makePreflightResult([
        makePreflightItem({
          fileName: 'queue-chat.json',
          sourcePath: '/tmp/queue-chat.json',
          status: 'supported'
        })
      ])
    )

    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn(),
        preflightImportBatch
      }
    })

    render(<ImportPage />)

    const dropSurface = screen.getByText('Import Workbench').closest('.fmImportDropzoneSurface')
    expect(dropSurface).not.toBeNull()

    const droppedFile = makeFileWithPath('queue-chat.json', '/tmp/queue-chat.json', 'application/json')
    await act(async () => {
      fireEvent.drop(dropSurface as HTMLElement, {
        dataTransfer: {
          files: [droppedFile]
        }
      })
      await Promise.resolve()
    })

    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.getByText('queue-chat.json')).toBeInTheDocument()
  })

  it('supports remove-one and clear-all actions on queued files', () => {
    const preflightImportBatch = vi.fn().mockImplementation(async (input: { sourcePaths: string[] }) =>
      makePreflightResult(
        input.sourcePaths.map((sourcePath) =>
          makePreflightItem({
            fileName: sourcePath.split('/').at(-1) ?? sourcePath,
            sourcePath,
            status: 'supported'
          })
        )
      )
    )

    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn(),
        preflightImportBatch
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

  it('does not start batch creation on drop alone', async () => {
    const createImportBatch = vi.fn()
    const preflightImportBatch = vi.fn().mockResolvedValue(
      makePreflightResult([
        makePreflightItem({
          fileName: 'queued.pdf',
          sourcePath: '/tmp/queued.pdf',
          status: 'supported',
          importKindHint: 'document'
        })
      ])
    )

    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn(),
        preflightImportBatch,
        createImportBatch
      }
    })

    render(<ImportPage />)

    const dropSurface = screen.getByText('Import Workbench').closest('.fmImportDropzoneSurface')
    expect(dropSurface).not.toBeNull()

    const droppedFile = makeFileWithPath('queued.pdf', '/tmp/queued.pdf', 'application/pdf')
    await act(async () => {
      fireEvent.drop(dropSurface as HTMLElement, {
        dataTransfer: {
          files: [droppedFile]
        }
      })
      await Promise.resolve()
    })

    expect(createImportBatch).not.toHaveBeenCalled()
  })

  it('uses queued selection for import confirmation and summarizes multi-file source labels', async () => {
    const createImportBatch = vi.fn().mockResolvedValue({
      batchId: 'batch-queued-1',
      sourceLabel: '2 files',
      createdAt: '2026-03-29T00:00:00.000Z',
      files: [
        {
          fileId: 'file-queued-1',
          fileName: 'queued.json',
          duplicateClass: 'unique',
          parserStatus: 'parsed',
          frozenAbsolutePath: '/tmp/queued.json'
        },
        {
          fileId: 'file-queued-2',
          fileName: 'queued-two.txt',
          duplicateClass: 'unique',
          parserStatus: 'parsed',
          frozenAbsolutePath: '/tmp/queued-two.txt'
        }
      ]
    })
    const selectImportFiles = vi.fn().mockResolvedValue(['/tmp/from-picker.json'])
    const preflightImportBatch = vi.fn().mockResolvedValue(
      makePreflightResult([
        makePreflightItem({
          fileName: 'queued.json',
          sourcePath: '/tmp/queued.json',
          status: 'supported'
        }),
        makePreflightItem({
          fileName: 'queued-two.txt',
          sourcePath: '/tmp/queued-two.txt',
          status: 'supported'
        })
      ])
    )

    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles,
        preflightImportBatch,
        createImportBatch
      }
    })

    render(<ImportPage />)

    const dropSurface = screen.getByText('Import Workbench').closest('.fmImportDropzoneSurface')
    expect(dropSurface).not.toBeNull()

    const droppedFile = makeFileWithPath('queued.json', '/tmp/queued.json', 'application/json')
    const secondDroppedFile = makeFileWithPath('queued-two.txt', '/tmp/queued-two.txt', 'text/plain')
    fireEvent.drop(dropSurface as HTMLElement, {
      dataTransfer: {
        files: [droppedFile, secondDroppedFile]
      }
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(await screen.findByText('2 supported, 0 unsupported')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Import Supported Files' }))
      await Promise.resolve()
    })
    expect(createImportBatch).toHaveBeenCalledWith({
      sourcePaths: ['/tmp/queued.json', '/tmp/queued-two.txt'],
      sourceLabel: '2 files'
    })
    expect(selectImportFiles).not.toHaveBeenCalled()
  })

  it('shows import outcome summary and next actions after a completed import', async () => {
    const onSelectBatch = vi.fn()
    const createdBatch = {
      batchId: 'batch-result-1',
      sourceLabel: '3 files',
      createdAt: '2026-03-29T09:00:00.000Z',
      summary: {
        frozenCount: 3,
        parsedCount: 2,
        duplicateCount: 1,
        reviewCount: 1
      },
      files: [
        {
          fileId: 'file-result-1',
          fileName: 'chat.txt',
          duplicateClass: 'unique',
          parserStatus: 'parsed',
          frozenAbsolutePath: '/tmp/chat.txt'
        },
        {
          fileId: 'file-result-2',
          fileName: 'photo.jpg',
          duplicateClass: 'duplicate_exact',
          parserStatus: 'parsed',
          frozenAbsolutePath: '/tmp/photo.jpg'
        },
        {
          fileId: 'file-result-3',
          fileName: 'memo.pdf',
          duplicateClass: 'unique',
          parserStatus: 'parsed',
          frozenAbsolutePath: '/tmp/memo.pdf'
        }
      ]
    }
    const listImportBatches = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdBatch])
    const preflightImportBatch = vi.fn().mockResolvedValue(
      makePreflightResult([
        makePreflightItem({
          fileName: 'chat.txt',
          sourcePath: '/tmp/chat.txt',
          status: 'supported'
        }),
        makePreflightItem({
          fileName: 'photo.jpg',
          sourcePath: '/tmp/photo.jpg',
          status: 'supported',
          importKindHint: 'image'
        }),
        makePreflightItem({
          fileName: 'memo.pdf',
          sourcePath: '/tmp/memo.pdf',
          status: 'supported',
          importKindHint: 'document'
        }),
        makePreflightItem({
          fileName: 'tool.exe',
          sourcePath: '/tmp/tool.exe',
          status: 'unsupported',
          importKindHint: 'unknown'
        })
      ])
    )

    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches,
        selectImportFiles: vi.fn().mockResolvedValue(['/tmp/chat.txt', '/tmp/photo.jpg', '/tmp/memo.pdf', '/tmp/tool.exe']),
        preflightImportBatch,
        createImportBatch: vi.fn().mockResolvedValue(createdBatch)
      }
    })

    render(<ImportPage onSelectBatch={onSelectBatch} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose Files' }))
      await Promise.resolve()
    })
    expect(await screen.findByText('3 supported, 1 unsupported')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Import Supported Files' }))
      await Promise.resolve()
    })

    expect(await screen.findByText('Imported 3 files')).toBeInTheDocument()
    expect(screen.getByText('Parsed: 2')).toBeInTheDocument()
    expect(screen.getByText('Duplicates: 1')).toBeInTheDocument()
    expect(screen.getByText('Review Queue: 1')).toBeInTheDocument()
    expect(screen.getByText('Skipped / Unsupported: 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View Batch Detail' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import More' })).toBeInTheDocument()
    expect(screen.getByText('Imported 3 · Parsed 2 · Duplicates 1 · Review 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View Batch Detail' }))
    expect(onSelectBatch).toHaveBeenCalledWith('batch-result-1')

    fireEvent.click(screen.getByRole('button', { name: 'Import More' }))
    expect(screen.queryByText('Imported 3 files')).not.toBeInTheDocument()
  })

  it('keeps dropzone inert while import is disabled in progress', async () => {
    let resolveCreateImportBatch: ((value: unknown) => void) | undefined
    const createImportBatch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreateImportBatch = resolve
        })
    )
    const preflightImportBatch = vi.fn().mockResolvedValue(
      makePreflightResult([
        makePreflightItem({
          fileName: 'queued.json',
          sourcePath: '/tmp/queued.json',
          status: 'supported'
        })
      ])
    )

    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn(),
        preflightImportBatch,
        createImportBatch
      }
    })

    render(<ImportPage />)

    const dropSurface = screen.getByText('Import Workbench').closest('.fmImportDropzoneSurface')
    expect(dropSurface).not.toBeNull()

    const queuedFile = makeFileWithPath('queued.json', '/tmp/queued.json', 'application/json')
    fireEvent.drop(dropSurface as HTMLElement, {
      dataTransfer: { files: [queuedFile] }
    })
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    expect(await screen.findByText('1 supported, 0 unsupported')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Import Supported Files' }))
    expect(screen.getByRole('button', { name: 'Choose Files' })).toBeDisabled()

    fireEvent.dragEnter(dropSurface as HTMLElement)
    expect(dropSurface).toHaveAttribute('data-drag-active', 'false')

    const extraFile = makeFileWithPath('extra.json', '/tmp/extra.json', 'application/json')
    fireEvent.drop(dropSurface as HTMLElement, {
      dataTransfer: { files: [extraFile] }
    })
    expect(screen.queryByText('extra.json')).not.toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    resolveCreateImportBatch?.({
      batchId: 'batch-disabled-1',
      sourceLabel: 'queued.json',
      createdAt: '2026-03-29T00:00:00.000Z',
      files: []
    })
    await act(async () => {
      await Promise.resolve()
    })
  })

  it('runs preflight before batch creation and only imports supported files after confirmation', async () => {
    const createImportBatch = vi.fn().mockResolvedValue({
      batchId: 'batch-supported-only-1',
      sourceLabel: 'chat.txt',
      createdAt: '2026-03-18T12:00:00.000Z',
      files: [
        {
          fileId: 'file-supported-1',
          fileName: 'chat.txt',
          duplicateClass: 'unique',
          parserStatus: 'parsed',
          frozenAbsolutePath: '/tmp/frozen-chat.txt'
        }
      ]
    })
    const preflightImportBatch = vi.fn().mockResolvedValue(
      makePreflightResult([
        makePreflightItem({
          fileName: 'chat.txt',
          sourcePath: '/tmp/chat.txt',
          status: 'supported'
        }),
        makePreflightItem({
          fileName: 'unsupported.exe',
          sourcePath: '/tmp/unsupported.exe',
          status: 'unsupported',
          importKindHint: 'unknown'
        })
      ])
    )

    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn().mockResolvedValue(['/tmp/chat.txt', '/tmp/unsupported.exe']),
        preflightImportBatch,
        createImportBatch
      }
    })

    render(<ImportPage />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose Files' }))
      await Promise.resolve()
    })

    expect(await screen.findByText('1 supported, 1 unsupported')).toBeInTheDocument()
    expect(screen.getByText('Unsupported files: unsupported.exe')).toBeInTheDocument()
    expect(createImportBatch).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Import Supported Files' }))
      await Promise.resolve()
    })
    expect(createImportBatch).toHaveBeenCalledWith({
      sourcePaths: ['/tmp/chat.txt'],
      sourceLabel: 'chat.txt'
    })
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
    const preflightImportBatch = vi.fn().mockResolvedValue(
      makePreflightResult([
        makePreflightItem({
          fileName: 'chat.txt',
          sourcePath: '/tmp/chat.txt',
          status: 'supported'
        })
      ])
    )

    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn().mockResolvedValue(['/tmp/chat.txt']),
        preflightImportBatch,
        createImportBatch
      }
    })

    render(<ImportPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose Files' }))
    await screen.findByText('1 supported, 0 unsupported')
    fireEvent.click(screen.getByRole('button', { name: 'Import Supported Files' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Some files could not be imported and were skipped.')
    expect(alert).toHaveTextContent('chat.txt')
    expect(createImportBatch).toHaveBeenCalled()
  })

  it('shows a safe import failure summary with raw error detail', async () => {
    const preflightImportBatch = vi.fn().mockResolvedValue(
      makePreflightResult([
        makePreflightItem({
          fileName: 'chat.txt',
          sourcePath: '/tmp/chat.txt',
          status: 'supported'
        })
      ])
    )

    vi.stubGlobal('window', {
      archiveApi: {
        listImportBatches: vi.fn().mockResolvedValue([]),
        selectImportFiles: vi.fn().mockResolvedValue(['/tmp/chat.txt']),
        preflightImportBatch,
        createImportBatch: vi.fn().mockRejectedValue(new Error('EACCES: permission denied, open /tmp/chat.txt'))
      }
    })

    render(<ImportPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose Files' }))
    await screen.findByText('1 supported, 0 unsupported')
    fireEvent.click(screen.getByRole('button', { name: 'Import Supported Files' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Some files could not be imported and were skipped.')
    expect(alert).toHaveTextContent('EACCES: permission denied, open /tmp/chat.txt')
  })
})
