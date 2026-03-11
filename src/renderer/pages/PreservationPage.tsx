import { useMemo, useState } from 'react'
import type { BackupExportResult, RestoreRunResult } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'

export function PreservationPage() {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [destinationRoot, setDestinationRoot] = useState('')
  const [exportRoot, setExportRoot] = useState('')
  const [targetRoot, setTargetRoot] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [lastExport, setLastExport] = useState<BackupExportResult | null>(null)
  const [lastRestore, setLastRestore] = useState<RestoreRunResult | null>(null)

  const handlePickExportDestination = async () => {
    const selected = await archiveApi.selectBackupExportDestination()
    if (selected) {
      setDestinationRoot(selected)
    }
  }

  const handlePickExportSource = async () => {
    const selected = await archiveApi.selectBackupExportSource()
    if (selected) {
      setExportRoot(selected)
    }
  }

  const handlePickRestoreTarget = async () => {
    const selected = await archiveApi.selectRestoreTargetDirectory()
    if (selected) {
      setTargetRoot(selected)
    }
  }

  const handleExport = async () => {
    setIsWorking(true)
    setStatusMessage('')

    const nextDestinationRoot = destinationRoot || await archiveApi.selectBackupExportDestination()
    if (!nextDestinationRoot) {
      setIsWorking(false)
      return
    }

    setDestinationRoot(nextDestinationRoot)
    try {
      const result = await archiveApi.createBackupExport({ destinationRoot: nextDestinationRoot })
      if (result) {
        setLastExport(result)
        setExportRoot(result.exportRoot)
        setStatusMessage('Export completed')
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Export failed')
    }

    setIsWorking(false)
  }

  const handleRestore = async () => {
    setIsWorking(true)
    setStatusMessage('')

    const nextExportRoot = exportRoot || lastExport?.exportRoot || await archiveApi.selectBackupExportSource()
    const nextTargetRoot = targetRoot || await archiveApi.selectRestoreTargetDirectory()

    if (!nextExportRoot || !nextTargetRoot) {
      setIsWorking(false)
      return
    }

    setExportRoot(nextExportRoot)
    setTargetRoot(nextTargetRoot)
    try {
      const result = await archiveApi.restoreBackupExport({ exportRoot: nextExportRoot, targetRoot: nextTargetRoot })
      if (result) {
        setLastRestore(result)
        setStatusMessage(result.checks.every((check) => check.status === 'passed') ? 'Restore checks passed' : 'Restore checks failed')
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Restore failed')
    }

    setIsWorking(false)
  }

  return (
    <section>
      <h2>Preservation</h2>
      <p>Export the local archive package and restore it into a fresh app-data root.</p>

      <div>
        <button type="button" onClick={() => void handlePickExportDestination()} disabled={isWorking}>Choose Export Destination</button>
        <div>{destinationRoot || 'No export destination selected.'}</div>
      </div>

      <div>
        <button type="button" onClick={() => void handlePickExportSource()} disabled={isWorking}>Choose Export Source</button>
        <div>{exportRoot || lastExport?.exportRoot || 'No export source selected.'}</div>
      </div>

      <div>
        <button type="button" onClick={() => void handlePickRestoreTarget()} disabled={isWorking}>Choose Restore Target</button>
        <div>{targetRoot || 'No restore target selected.'}</div>
      </div>

      <div>
        <button type="button" onClick={() => void handleExport()} disabled={isWorking}>Export Archive</button>
        <button type="button" onClick={() => void handleRestore()} disabled={isWorking}>Restore Archive</button>
      </div>

      {statusMessage ? <p>{statusMessage}</p> : null}
      {lastExport ? <p>Last export: {lastExport.exportRoot}</p> : null}
      {lastRestore ? <p>Last restore target: {lastRestore.targetRoot}</p> : null}
    </section>
  )
}
