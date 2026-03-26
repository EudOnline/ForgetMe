import { useMemo, useState } from 'react'
import type { BackupExportResult, RestoreRunResult } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { useI18n } from '../i18n'

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function PreservationPage() {
  const { t } = useI18n()
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [destinationRoot, setDestinationRoot] = useState('')
  const [exportRoot, setExportRoot] = useState('')
  const [targetRoot, setTargetRoot] = useState('')
  const [exportPassword, setExportPassword] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const [status, setStatus] = useState<{
    kind: 'success' | 'error'
    summary: string
    detail?: string
  } | null>(null)
  const [lastExport, setLastExport] = useState<BackupExportResult | null>(null)
  const [lastRestore, setLastRestore] = useState<RestoreRunResult | null>(null)
  const [lastDrill, setLastDrill] = useState<RestoreRunResult | null>(null)

  const summarizePreservationError = (errorMessage: string, fallbackSummary: string) => {
    if (errorMessage.startsWith('Target root is not empty')) {
      return t('preservation.error.restoreTargetNotEmpty')
    }

    if (errorMessage.includes('Encrypted backup requires a password')) {
      return t('preservation.error.passwordRequired')
    }

    if (errorMessage.includes('Encrypted backup password is invalid or the package is corrupted')) {
      return t('preservation.error.passwordInvalid')
    }

    return fallbackSummary
  }

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
    setStatus(null)

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
        setStatus({
          kind: 'success',
          summary: t('preservation.exportCompleted')
        })
      }
    } catch (error) {
      const errorMessage = asErrorMessage(error)
      setStatus({
        kind: 'error',
        summary: summarizePreservationError(errorMessage, t('preservation.exportFailed')),
        detail: errorMessage
      })
    }

    setIsWorking(false)
  }

  const handleRestore = async () => {
    setIsWorking(true)
    setStatus(null)

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
        setStatus({
          kind: result.checks.every((check) => check.status === 'passed') ? 'success' : 'error',
          summary: result.checks.every((check) => check.status === 'passed')
            ? t('preservation.restoreChecksPassed')
            : t('preservation.restoreChecksFailed')
        })
      }
    } catch (error) {
      const errorMessage = asErrorMessage(error)
      setStatus({
        kind: 'error',
        summary: summarizePreservationError(errorMessage, t('preservation.restoreFailed')),
        detail: errorMessage
      })
    }

    setIsWorking(false)
  }

  const handleRecoveryDrill = async () => {
    setIsWorking(true)
    setStatus(null)

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
        setStatus({
          kind: result.summary.failedCount === 0 ? 'success' : 'error',
          summary: result.summary.failedCount === 0 ? t('preservation.drillPassed') : t('preservation.drillFailed')
        })
      }
    } catch (error) {
      const errorMessage = asErrorMessage(error)
      setStatus({
        kind: 'error',
        summary: summarizePreservationError(errorMessage, t('preservation.drillFailed')),
        detail: errorMessage
      })
    }

    setIsWorking(false)
  }

  return (
    <section>
      <h2>{t('preservation.title')}</h2>
      <p>{t('preservation.subtitle')}</p>

      <div>
        <button type="button" onClick={() => void handlePickExportDestination()} disabled={isWorking}>{t('preservation.chooseExportDestination')}</button>
        <div>{destinationRoot || t('preservation.noExportDestination')}</div>
      </div>

      <div>
        <button type="button" onClick={() => void handlePickExportSource()} disabled={isWorking}>{t('preservation.chooseExportSource')}</button>
        <div>{exportRoot || lastExport?.exportRoot || t('preservation.noExportSource')}</div>
      </div>

      <div>
        <button type="button" onClick={() => void handlePickRestoreTarget()} disabled={isWorking}>{t('preservation.chooseRestoreTarget')}</button>
        <div>{targetRoot || t('preservation.noRestoreTarget')}</div>
      </div>

      <label>
        {t('preservation.exportPassword')}
        <input type="password" value={exportPassword} onChange={(event) => setExportPassword(event.target.value)} />
      </label>

      <label>
        {t('preservation.restorePassword')}
        <input type="password" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} />
      </label>

      <div>
        <button type="button" onClick={() => void handleExport()} disabled={isWorking}>{t('preservation.exportArchive')}</button>
        <button type="button" onClick={() => void handleRestore()} disabled={isWorking}>{t('preservation.restoreArchive')}</button>
        <button type="button" onClick={() => void handleRecoveryDrill()} disabled={isWorking}>{t('preservation.runRecoveryDrill')}</button>
      </div>

      {status ? (
        <div role={status.kind === 'error' ? 'alert' : 'status'}>
          <p>{status.summary}</p>
          {status.detail && status.detail !== status.summary ? (
            <p>{t('preservation.error.detail', { message: status.detail })}</p>
          ) : null}
        </div>
      ) : null}
      {lastExport ? <p>{t('preservation.lastExport', { path: lastExport.exportRoot })}</p> : null}
      {lastRestore ? <p>{t('preservation.lastRestore', { path: lastRestore.targetRoot })}</p> : null}
      {lastDrill ? <p>{t('preservation.lastDrill', { path: lastDrill.targetRoot })}</p> : null}
      {lastDrill ? (
        <div>
          <h3>{t('preservation.drillReport.title')}</h3>
          <p>{t('preservation.drillReport.summary', { passed: lastDrill.summary.passedCount, failed: lastDrill.summary.failedCount })}</p>
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
