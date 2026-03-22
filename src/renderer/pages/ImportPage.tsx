import { useEffect, useMemo, useState } from 'react'
import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { useI18n } from '../i18n'
import { BatchListPage } from './BatchListPage'
import { ImportDropzone } from '../components/ImportDropzone'

function basename(filePath: string) {
  return filePath.split(/[/\\]/).filter(Boolean).at(-1) ?? filePath
}

export function ImportPage(props: {
  onSelectBatch?: (batchId: string) => void
  onBatchesUpdated?: (batches: ImportBatchSummary[]) => void
}) {
  const { t } = useI18n()
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [batches, setBatches] = useState<ImportBatchSummary[]>([])
  const [isImporting, setIsImporting] = useState(false)

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
    const sourcePaths = await archiveApi.selectImportFiles()
    if (sourcePaths.length > 0) {
      const sourceLabel = basename(sourcePaths[0])
      await archiveApi.createImportBatch({ sourcePaths, sourceLabel })
      const nextBatches = await archiveApi.listImportBatches()
      setBatches(nextBatches)
      props.onBatchesUpdated?.(nextBatches)
    }
    setIsImporting(false)
  }

  return (
    <section>
      <h1>{t('import.title')}</h1>
      <ImportDropzone onImport={handleImport} disabled={isImporting} />
      <BatchListPage batches={batches} onSelectBatch={props.onSelectBatch} />
    </section>
  )
}
