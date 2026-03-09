import { useEffect, useMemo, useState } from 'react'
import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { BatchListPage } from './BatchListPage'
import { ImportDropzone } from '../components/ImportDropzone'

const fallbackApi = {
  selectImportFiles: async () => [] as string[],
  createImportBatch: async () => ({ batchId: '', sourceLabel: '', createdAt: '', files: [] }),
  listImportBatches: async () => [] as ImportBatchSummary[],
  getImportBatch: async () => null
}

export function ImportPage(props: { onSelectBatch?: (batchId: string) => void }) {
  const archiveApi = useMemo(() => window.archiveApi ?? fallbackApi, [])
  const [batches, setBatches] = useState<ImportBatchSummary[]>([])
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    void archiveApi.listImportBatches().then((nextBatches) => {
      if (nextBatches.length > 0) {
        setBatches(nextBatches)
      }
    })
  }, [archiveApi])

  const handleImport = async () => {
    setIsImporting(true)
    const sourcePaths = await archiveApi.selectImportFiles()
    if (sourcePaths.length > 0) {
      await archiveApi.createImportBatch({ sourcePaths, sourceLabel: 'manual-import' })
      setBatches(await archiveApi.listImportBatches())
    }
    setIsImporting(false)
  }

  return (
    <section>
      <h1>Import Batch</h1>
      <ImportDropzone onImport={handleImport} disabled={isImporting} />
      <BatchListPage batches={batches} onSelectBatch={props.onSelectBatch} />
    </section>
  )
}
