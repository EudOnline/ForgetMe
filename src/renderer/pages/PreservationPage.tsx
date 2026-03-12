import { useMemo, useState } from 'react'
import type { BackupExportResult, RestoreRunResult } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'

export function PreservationPage() {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [destinationRoot, setDestinationRoot] = useState('')
  const [exportRoot, setExportRoot] = useState('')
  const [targetRoot, setTargetRoot] = useState('')
  const [exportPassword, setExportPassword] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [lastExport, setLastExport] = useState<BackupExportResult | null>(null)
  const [lastRestore, setLastRestore] = useState<RestoreRunResult | null>(null)
  const [lastDrill, setLastDrill] = useState<RestoreRunResult | null>(null)

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
      const result = await archiveApi.createBackupExport({
        destinationRoot: nextDestinationRoot,
        encryptionPassword: exportPassword || undefined
      })
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
      const result = await archiveApi.restoreBackupExport({
        exportRoot: nextExportRoot,
        targetRoot: nextTargetRoot,
        encryptionPassword: restorePassword || undefined
      })
      if (result) {
        setLastRestore(result)
        setStatusMessage(result.checks.every((check) => check.status === 'passed') ? 'Restore checks passed' : 'Restore checks failed')
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Restore failed')
    }

    setIsWorking(false)
  }

  const handleRecoveryDrill = async () => {
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
      const result = await archiveApi.runRecoveryDrill({
        exportRoot: nextExportRoot,
        targetRoot: nextTargetRoot,
        encryptionPassword: restorePassword || undefined
      })
      if (result) {
        setLastDrill(result)
        setStatusMessage(result.summary.failedCount === 0 ? 'Recovery drill passed' : 'Recovery drill failed')
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Recovery drill failed')
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

      <label>
        Export password
        <input type="password" value={exportPassword} onChange={(event) => setExportPassword(event.target.value)} />
      </label>

      <label>
        Restore password
        <input type="password" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} />
      </label>

      <div>
        <button type="button" onClick={() => void handleExport()} disabled={isWorking}>Export Archive</button>
        <button type="button" onClick={() => void handleRestore()} disabled={isWorking}>Restore Archive</button>
        <button type="button" onClick={() => void handleRecoveryDrill()} disabled={isWorking}>Run Recovery Drill</button>
      </div>

      {statusMessage ? <p>{statusMessage}</p> : null}
      {lastExport ? <p>Last export: {lastExport.exportRoot}</p> : null}
      {lastRestore ? <p>Last restore target: {lastRestore.targetRoot}</p> : null}
      {lastDrill ? <p>Last recovery drill target: {lastDrill.targetRoot}</p> : null}
      {lastDrill ? (
        <div>
          <h3>Recovery Drill Report</h3>
          <p>{lastDrill.summary.passedCount} passed · {lastDrill.summary.failedCount} failed</p>
          <ul>
            {lastDrill.checks.map((check) => (
              <li key={check.name}>
                <strong>{check.name}</strong>
                <div>{check.detail}</div>
                {check.expected ? <pre>{JSON.stringify(check.expected, null, 2)}</pre> : null}
                {check.actual ? <pre>{JSON.stringify(check.actual, null, 2)}</pre> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
