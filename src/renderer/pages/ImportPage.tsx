import { useEffect, useMemo, useState } from 'react'
import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { useI18n } from '../i18n'
import { BatchListPage } from './BatchListPage'
import { ImportDropzone } from '../components/ImportDropzone'

const SUPPORTED_IMPORT_EXTENSIONS = new Set(['.json', '.txt', '.jpg', '.jpeg', '.png', '.heic', '.pdf', '.docx'])

function basename(filePath: string) {
  return filePath.split(/[/\\]/).filter(Boolean).at(-1) ?? filePath
}

function extension(filePath: string) {
  const fileName = basename(filePath)
  const lastDotIndex = fileName.lastIndexOf('.')
  return lastDotIndex >= 0 ? fileName.slice(lastDotIndex).toLowerCase() : ''
}

function looksUnsupported(filePath: string) {
  const ext = extension(filePath)
  return ext.length > 0 && !SUPPORTED_IMPORT_EXTENSIONS.has(ext)
}

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function ImportPage(props: {
  onSelectBatch?: (batchId: string) => void
  onBatchesUpdated?: (batches: ImportBatchSummary[]) => void
}) {
  const { t } = useI18n()
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [batches, setBatches] = useState<ImportBatchSummary[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<{
    kind: 'error'
    summary: string
    detail?: string
  } | null>(null)

  useEffect(() => {
    void archiveApi.listImportBatches().then((nextBatches) => {
      if (nextBatches.length > 0) {
        setBatches(nextBatches)
        props.onBatchesUpdated?.(nextBatches)
      }
    })
  }, [archiveApi, props.onBatchesUpdated])

  const handleImport = async () => {
    setIsImporting(true)
    setImportStatus(null)
    try {
      const sourcePaths = await archiveApi.selectImportFiles()
      if (sourcePaths.length > 0) {
        const sourceLabel = basename(sourcePaths[0])
        const createdBatch = await archiveApi.createImportBatch({ sourcePaths, sourceLabel })
        const nextBatches = await archiveApi.listImportBatches()
        setBatches(nextBatches)
        props.onBatchesUpdated?.(nextBatches)

        const unsupportedFiles = sourcePaths.filter((filePath) => looksUnsupported(filePath)).map((filePath) => basename(filePath))
        if (unsupportedFiles.length > 0) {
          setImportStatus({
            kind: 'error',
            summary: t('import.feedback.unsupportedSkipped'),
            detail: t('import.feedback.skippedFilesDetail', { files: unsupportedFiles.join(', ') })
          })
          return
        }

        const failedFiles = (createdBatch.files ?? [])
          .filter((file) => file.parserStatus !== 'parsed')
          .map((file) => file.fileName)
        if (failedFiles.length > 0) {
          setImportStatus({
            kind: 'error',
            summary: t('import.feedback.filesSkipped'),
            detail: t('import.feedback.skippedFilesDetail', { files: failedFiles.join(', ') })
          })
        }
      }
    } catch (error) {
      setImportStatus({
        kind: 'error',
        summary: t('import.feedback.filesSkipped'),
        detail: t('import.feedback.rawDetail', { message: asErrorMessage(error) })
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <section>
      <h1>{t('import.title')}</h1>
      <ImportDropzone onImport={handleImport} disabled={isImporting} />
      {importStatus ? (
        <div role="alert">
          <p>{importStatus.summary}</p>
          {importStatus.detail ? <p>{importStatus.detail}</p> : null}
        </div>
      ) : null}
      <BatchListPage batches={batches} onSelectBatch={props.onSelectBatch} />
    </section>
  )
}
