import { useEffect, useMemo, useState } from 'react'
import { APP_NAME } from '../shared/archiveTypes'
import type { ImportBatchSummary } from '../shared/archiveContracts'
import { BatchDetailPage } from './pages/BatchDetailPage'
import { BatchListPage } from './pages/BatchListPage'
import { ImportPage } from './pages/ImportPage'
import { SearchPage } from './pages/SearchPage'

const fallbackApi = {
  listImportBatches: async () => [] as ImportBatchSummary[],
  getImportBatch: async () => null as ImportBatchSummary | null
}

export default function App() {
  const archiveApi = useMemo(() => window.archiveApi ?? fallbackApi, [])
  const [batches, setBatches] = useState<ImportBatchSummary[]>([])
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchSummary | null>(null)
  const [page, setPage] = useState<'import' | 'batches' | 'detail' | 'search'>('import')

  useEffect(() => {
    void archiveApi.listImportBatches().then(setBatches)
  }, [archiveApi])

  const handleSelectBatch = async (batchId: string) => {
    const batch = await archiveApi.getImportBatch(batchId)
    setSelectedBatch(batch)
    setPage('detail')
  }

  return (
    <main>
      <header>
        <h1>{APP_NAME}</h1>
        <nav>
          <button type="button" onClick={() => setPage('import')}>Import</button>
          <button type="button" onClick={() => setPage('batches')}>Batches</button>
          <button type="button" onClick={() => setPage('search')}>Search</button>
        </nav>
      </header>

      {page === 'import' ? <ImportPage onSelectBatch={handleSelectBatch} /> : null}
      {page === 'batches' ? <BatchListPage batches={batches} onSelectBatch={handleSelectBatch} /> : null}
      {page === 'detail' ? <BatchDetailPage batch={selectedBatch} /> : null}
      {page === 'search' ? <SearchPage /> : null}
    </main>
  )
}
