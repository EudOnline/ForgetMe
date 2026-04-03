import { useEffect, useMemo, useRef, useState } from 'react'
import type { ImportBatchSummary, ImportPreflightResult } from '../../shared/archiveContracts'
import { getImportClient } from '../clients/importClient'
import { useI18n } from '../i18n'
import { BatchListPage } from './BatchListPage'
import { ImportDropzone } from '../components/ImportDropzone'
import type { SelectedImportFile } from '../components/ImportDropzone'

function basename(filePath: string) {
  return filePath.split(/[/\\]/).filter(Boolean).at(-1) ?? filePath
}

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function toSelectedImportFile(filePath: string): SelectedImportFile {
  return {
    id: filePath,
    name: basename(filePath),
    path: filePath
  }
}

function dedupeSelectedFiles(files: SelectedImportFile[]) {
  const seenPaths = new Set<string>()
  return files.filter((file) => {
    if (seenPaths.has(file.path)) {
      return false
    }
    seenPaths.add(file.path)
    return true
  })
}

function buildSourceLabel(sourcePaths: string[], multipleLabel: string) {
  if (sourcePaths.length <= 1) {
    return sourcePaths[0] ? basename(sourcePaths[0]) : ''
  }

  return multipleLabel
}

function getBatchCounts(batch: ImportBatchSummary) {
  return {
    importedCount: batch.summary?.frozenCount ?? batch.files?.length ?? 0,
    parsedCount: batch.summary?.parsedCount ?? batch.files?.filter((file) => file.parserStatus === 'parsed').length ?? 0,
    duplicateCount:
      batch.summary?.duplicateCount ?? batch.files?.filter((file) => file.duplicateClass === 'duplicate_exact').length ?? 0,
    reviewCount: batch.summary?.reviewCount ?? 0
  }
}

function outcomeTitle(importedCount: number, t: ReturnType<typeof useI18n>['t']) {
  return importedCount === 1
    ? t('import.outcome.titleSingle')
    : t('import.outcome.titleMultiple', { count: importedCount })
}

export function ImportPage(props: {
  onSelectBatch?: (batchId: string) => void
  onBatchesUpdated?: (batches: ImportBatchSummary[]) => void
  onOpenReviewQueue?: () => void
}) {
  const { t } = useI18n()
  const importClient = useMemo(() => getImportClient(), [])
  const { onBatchesUpdated, onOpenReviewQueue, onSelectBatch } = props
  const [batches, setBatches] = useState<ImportBatchSummary[]>([])
  const [phase, setPhase] = useState<'idle' | 'selected' | 'preflight_ready' | 'importing' | 'completed' | 'error'>('idle')
  const [selectedFiles, setSelectedFiles] = useState<SelectedImportFile[]>([])
  const [preflightResult, setPreflightResult] = useState<ImportPreflightResult | null>(null)
  const [importStatus, setImportStatus] = useState<{
    kind: 'error'
    summary: string
    detail?: string
  } | null>(null)
  const [importOutcome, setImportOutcome] = useState<{
    batch: ImportBatchSummary
    importedCount: number
    parsedCount: number
    duplicateCount: number
    reviewCount: number
    skippedCount: number
  } | null>(null)
  const skipEmptySelectionResetRef = useRef(false)

  useEffect(() => {
    void importClient.listImportBatches().then((nextBatches) => {
      if (nextBatches.length > 0) {
        setBatches(nextBatches)
        onBatchesUpdated?.(nextBatches)
      }
    })
  }, [importClient, onBatchesUpdated])

  useEffect(() => {
    if (selectedFiles.length === 0) {
      if (skipEmptySelectionResetRef.current) {
        skipEmptySelectionResetRef.current = false
        return
      }

      setPreflightResult(null)
      setImportStatus(null)
      setPhase('idle')
      return
    }

    let cancelled = false
    setImportOutcome(null)
    setImportStatus(null)
    setPreflightResult(null)
    setPhase('selected')

    void importClient
      .preflightImportBatch({ sourcePaths: selectedFiles.map((file) => file.path) })
      .then((result) => {
        if (cancelled) {
          return
        }

        setPreflightResult(result)
        setPhase('preflight_ready')
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setPhase('error')
        setImportStatus({
          kind: 'error',
          summary: t('import.feedback.preflightFailed'),
          detail: t('import.feedback.rawDetail', { message: asErrorMessage(error) })
        })
      })

    return () => {
      cancelled = true
    }
  }, [importClient, selectedFiles, t])

  const handleChooseFiles = async () => {
    if (phase === 'importing') {
      return
    }

    const sourcePaths = await importClient.selectImportFiles()
    if (sourcePaths.length === 0) {
      return
    }

    setSelectedFiles((currentFiles) => dedupeSelectedFiles([...currentFiles, ...sourcePaths.map(toSelectedImportFile)]))
  }

  const handleImport = async () => {
    if (!preflightResult) {
      return
    }

    const supportedSourcePaths = preflightResult.items
      .filter((item) => item.isSupported)
      .map((item) => item.sourcePath)

    if (supportedSourcePaths.length === 0) {
      return
    }

    setPhase('importing')
    setImportStatus(null)
    try {
      const sourceLabel = buildSourceLabel(
        supportedSourcePaths,
        t('import.preflight.sourceLabelMultiple', { count: supportedSourcePaths.length })
      )
      const createdBatch = await importClient.createImportBatch({ sourcePaths: supportedSourcePaths, sourceLabel })
      const nextBatches = await importClient.listImportBatches()
      setBatches(nextBatches)
      onBatchesUpdated?.(nextBatches)

      const failedFiles = (createdBatch.files ?? [])
        .filter((file) => file.parserStatus !== 'parsed')
        .map((file) => file.fileName)
      const counts = getBatchCounts(createdBatch)
      setImportOutcome({
        batch: createdBatch,
        ...counts,
        skippedCount: preflightResult.summary.unsupportedCount + failedFiles.length
      })
      setPreflightResult(null)
      skipEmptySelectionResetRef.current = true
      setSelectedFiles([])

      if (failedFiles.length > 0) {
        setPhase('error')
        setImportStatus({
          kind: 'error',
          summary: t('import.feedback.filesSkipped'),
          detail: t('import.feedback.skippedFilesDetail', { files: failedFiles.join(', ') })
        })
        return
      }

      setPhase('completed')
    } catch (error) {
      setPhase('error')
      setImportStatus({
        kind: 'error',
        summary: t('import.feedback.filesSkipped'),
        detail: t('import.feedback.rawDetail', { message: asErrorMessage(error) })
      })
    }
  }

  const handleImportMore = () => {
    setImportOutcome(null)
    setPreflightResult(null)
    setImportStatus(null)
    setPhase('idle')
  }

  const unsupportedItems = preflightResult?.items.filter((item) => item.status === 'unsupported') ?? []
  const duplicateCandidateCount =
    preflightResult?.items.filter((item) => item.status === 'duplicate_candidate').length ?? 0
  const canConfirmImport =
    preflightResult !== null && preflightResult.summary.supportedCount > 0 && phase !== 'selected' && phase !== 'completed'

  return (
    <section>
      <h1>{t('import.title')}</h1>
      <ImportDropzone
        onImport={() => {
          void handleChooseFiles()
        }}
        disabled={phase === 'importing'}
        selectedFiles={selectedFiles}
        onSelectedFilesChange={(nextFiles) => {
          setSelectedFiles(dedupeSelectedFiles(nextFiles))
        }}
      />
      {selectedFiles.length > 0 || preflightResult ? (
        <section aria-label={t('import.preflight.title')}>
          <h2>{t('import.preflight.title')}</h2>
          {phase === 'selected' ? <p>{t('common.loading')}</p> : null}
          {preflightResult ? (
            <>
              <p>
                {t('import.preflight.summary', {
                  supportedCount: preflightResult.summary.supportedCount,
                  unsupportedCount: preflightResult.summary.unsupportedCount
                })}
              </p>
              {unsupportedItems.length > 0 ? (
                <p>{t('import.preflight.unsupportedDetail', { files: unsupportedItems.map((item) => item.fileName).join(', ') })}</p>
              ) : null}
              {duplicateCandidateCount > 0 ? (
                <p>{t('import.preflight.duplicateCandidates', { count: duplicateCandidateCount })}</p>
              ) : null}
              {canConfirmImport ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleImport()
                  }}
                  disabled={phase === 'importing'}
                >
                  {t('import.preflight.confirmImport')}
                </button>
              ) : null}
              {phase === 'preflight_ready' && preflightResult.summary.supportedCount === 0 ? (
                <p>{t('import.preflight.noSupported')}</p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
      {importStatus ? (
        <div role="alert">
          <p>{importStatus.summary}</p>
          {importStatus.detail ? <p>{importStatus.detail}</p> : null}
        </div>
      ) : null}
      {importOutcome ? (
        <section aria-label={t('import.outcome.sectionTitle')}>
          <h2>{outcomeTitle(importOutcome.importedCount, t)}</h2>
          <p>{t('import.outcome.parsed', { count: importOutcome.parsedCount })}</p>
          <p>{t('import.outcome.duplicates', { count: importOutcome.duplicateCount })}</p>
          <p>{t('import.outcome.reviewQueue', { count: importOutcome.reviewCount })}</p>
          <p>{t('import.outcome.skipped', { count: importOutcome.skippedCount })}</p>
          <div>
            <button
              type="button"
              onClick={() => {
                onSelectBatch?.(importOutcome.batch.batchId)
              }}
            >
              {t('import.outcome.viewBatchDetail')}
            </button>
            {importOutcome.reviewCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  onOpenReviewQueue?.()
                }}
              >
                {t('import.outcome.openReviewQueue')}
              </button>
            ) : null}
            <button type="button" onClick={handleImportMore}>
              {t('import.outcome.importMore')}
            </button>
          </div>
        </section>
      ) : null}
      <BatchListPage batches={batches} onSelectBatch={onSelectBatch} />
    </section>
  )
}
