import { useEffect, useMemo, useState } from 'react'
import { APP_NAME } from '../shared/archiveTypes'
import type { ImportBatchSummary } from '../shared/archiveContracts'
import { getArchiveApi } from './archiveApi'
import { BatchDetailPage } from './pages/BatchDetailPage'
import { BatchListPage } from './pages/BatchListPage'
import { ImportPage } from './pages/ImportPage'
import { PeoplePage } from './pages/PeoplePage'
import { PersonDetailPage } from './pages/PersonDetailPage'
import { ReviewQueuePage } from './pages/ReviewQueuePage'
import { SearchPage } from './pages/SearchPage'

export default function App() {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [batches, setBatches] = useState<ImportBatchSummary[]>([])
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchSummary | null>(null)
  const [selectedCanonicalPersonId, setSelectedCanonicalPersonId] = useState<string | null>(null)
  const [page, setPage] = useState<'import' | 'batches' | 'detail' | 'search' | 'people' | 'person' | 'review'>('import')

  useEffect(() => {
    void archiveApi.listImportBatches().then(setBatches)
  }, [archiveApi])

  const handleSelectBatch = async (batchId: string) => {
    const batch = await archiveApi.getImportBatch(batchId)
    setSelectedBatch(batch)
    setPage('detail')
  }

  const handleSelectPerson = (canonicalPersonId: string) => {
    setSelectedCanonicalPersonId(canonicalPersonId)
    setPage('person')
  }

  return (
    <main>
      <header>
        <h1>{APP_NAME}</h1>
        <nav>
          <button type="button" onClick={() => setPage('import')}>Import</button>
          <button type="button" onClick={() => setPage('batches')}>Batches</button>
          <button type="button" onClick={() => setPage('search')}>Search</button>
          <button type="button" onClick={() => setPage('people')}>People</button>
          <button type="button" onClick={() => setPage('review')}>Review Queue</button>
        </nav>
      </header>

      {page === 'import' ? <ImportPage onSelectBatch={handleSelectBatch} /> : null}
      {page === 'batches' ? <BatchListPage batches={batches} onSelectBatch={handleSelectBatch} /> : null}
      {page === 'detail' ? <BatchDetailPage batch={selectedBatch} /> : null}
      {page === 'search' ? <SearchPage /> : null}
      {page === 'people' ? <PeoplePage onSelectPerson={handleSelectPerson} /> : null}
      {page === 'person' ? <PersonDetailPage canonicalPersonId={selectedCanonicalPersonId} /> : null}
      {page === 'review' ? <ReviewQueuePage /> : null}
    </main>
  )
}
