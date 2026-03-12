import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
        restoreBackupExport: vi.fn(),
        runRecoveryDrill: vi.fn()
      }
    })

    render(<PreservationPage />)

    expect(screen.getByRole('button', { name: 'Export Archive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore Archive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run Recovery Drill' })).toBeInTheDocument()
  })

  it('runs a recovery drill and renders failed-check details', async () => {
    const runRecoveryDrill = vi.fn().mockResolvedValue({
      mode: 'recovery_drill',
      status: 'failed',
      exportRoot: '/tmp/export-1',
      targetRoot: '/tmp/restore-root',
      restoredAt: '2026-03-12T00:00:00.000Z',
      summary: {
        passedCount: 2,
        failedCount: 1
      },
      checks: [
        {
          name: 'vault_entry_count',
          status: 'failed',
          detail: 'Restored vault entry count differs from manifest.',
          expected: {
            count: 1
          },
          actual: {
            count: 0,
            missingRelativePaths: ['vault/originals/ab/abcdef.txt']
          }
        }
      ]
    })

    vi.stubGlobal('window', {
      archiveApi: {
        selectBackupExportDestination: vi.fn(),
        selectBackupExportSource: vi.fn().mockResolvedValue('/tmp/export-1'),
        selectRestoreTargetDirectory: vi.fn().mockResolvedValue('/tmp/restore-root'),
        createBackupExport: vi.fn(),
        restoreBackupExport: vi.fn(),
        runRecoveryDrill
      }
    })

    render(<PreservationPage />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run Recovery Drill' }))
    })

    expect(runRecoveryDrill).toHaveBeenCalledWith({
      exportRoot: '/tmp/export-1',
      targetRoot: '/tmp/restore-root'
    })
    expect(await screen.findByText('Recovery drill failed')).toBeInTheDocument()
    expect(screen.getByText('vault_entry_count')).toBeInTheDocument()
    expect(screen.getByText(/missingRelativePaths/i)).toBeInTheDocument()
  })

  it('passes export and restore passwords through the preservation actions', async () => {
    const createBackupExport = vi.fn().mockResolvedValue({
      status: 'exported',
      exportRoot: '/tmp/export-1',
      manifestPath: '/tmp/export-1/manifest.json',
      vaultEntryCount: 1,
      totalBytes: 10,
      packageMode: 'encrypted',
      encryptedArtifactPath: '/tmp/export-1/package/archive.enc',
      manifest: {
        formatVersion: 'phase6a1',
        appVersion: '0.1.0',
        createdAt: '2026-03-12T00:00:00.000Z',
        exportRootName: 'forgetme-export-test',
        databaseSnapshot: {
          relativePath: 'database/archive.sqlite',
          fileSize: 1,
          sha256: 'hash-db'
        },
        vaultEntries: [],
        tableCounts: {},
        package: {
          mode: 'encrypted',
          encryptedArtifactRelativePath: 'package/archive.enc',
          algorithm: 'aes-256-gcm',
          kdf: 'scrypt',
          saltBase64: 'salt',
          ivBase64: 'iv',
          authTagBase64: 'tag',
          payloadEncoding: 'gzip-json-v1'
        }
      }
    })
    const restoreBackupExport = vi.fn().mockResolvedValue({
      mode: 'restore',
      status: 'restored',
      exportRoot: '/tmp/export-1',
      targetRoot: '/tmp/restore-root',
      restoredAt: '2026-03-12T00:00:00.000Z',
      summary: {
        passedCount: 4,
        failedCount: 0
      },
      checks: []
    })

    vi.stubGlobal('window', {
      archiveApi: {
        selectBackupExportDestination: vi.fn().mockResolvedValue('/tmp/export-destination'),
        selectBackupExportSource: vi.fn().mockResolvedValue('/tmp/export-1'),
        selectRestoreTargetDirectory: vi.fn().mockResolvedValue('/tmp/restore-root'),
        createBackupExport,
        restoreBackupExport,
        runRecoveryDrill: vi.fn()
      }
    })

    render(<PreservationPage />)

    fireEvent.change(screen.getByLabelText('Export password'), { target: { value: 'secret-export' } })
    fireEvent.change(screen.getByLabelText('Restore password'), { target: { value: 'secret-restore' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export Archive' }))
    })

    expect(createBackupExport).toHaveBeenCalledWith({
      destinationRoot: '/tmp/export-destination',
      encryptionPassword: 'secret-export'
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore Archive' }))
    })

    expect(restoreBackupExport).toHaveBeenCalledWith({
      exportRoot: '/tmp/export-1',
      targetRoot: '/tmp/restore-root',
      encryptionPassword: 'secret-restore'
    })
  })
})
