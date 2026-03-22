import '@testing-library/jest-dom/vitest'
import { render, screen } from './testing-library'
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
})
