import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreservationPage } from '../../../src/renderer/pages/PreservationPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PreservationPage', () => {
  it('renders export and restore actions', () => {
    vi.stubGlobal('window', {
      archiveApi: {
        selectBackupExportDestination: vi.fn(),
        selectBackupExportSource: vi.fn(),
        selectRestoreTargetDirectory: vi.fn(),
        createBackupExport: vi.fn(),
        restoreBackupExport: vi.fn()
      }
    })

    render(<PreservationPage />)

    expect(screen.getByRole('button', { name: 'Export Archive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore Archive' })).toBeInTheDocument()
  })
})
