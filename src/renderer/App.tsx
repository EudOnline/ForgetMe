import { useEffect, useMemo, useState } from 'react'
import { APP_NAME } from '../shared/archiveTypes'
import type { ImportBatchSummary } from '../shared/archiveContracts'
import { getArchiveApi } from './archiveApi'
import { BatchDetailPage } from './pages/BatchDetailPage'
import { BatchListPage } from './pages/BatchListPage'
import { DocumentEvidencePage } from './pages/DocumentEvidencePage'
import { EnrichmentJobsPage } from './pages/EnrichmentJobsPage'
import { ImportPage } from './pages/ImportPage'
import { PeoplePage } from './pages/PeoplePage'
import { PreservationPage } from './pages/PreservationPage'
import { PersonDetailPage } from './pages/PersonDetailPage'
import { ReviewQueuePage } from './pages/ReviewQueuePage'
import { ReviewWorkbenchPage } from './pages/ReviewWorkbenchPage'
import { SearchPage } from './pages/SearchPage'

export default function App() {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [batches, setBatches] = useState<ImportBatchSummary[]>([])
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchSummary | null>(null)
  const [selectedCanonicalPersonId, setSelectedCanonicalPersonId] = useState<string | null>(null)
  const [selectedEvidenceFileId, setSelectedEvidenceFileId] = useState<string | null>(null)
  const [selectedReviewWorkbenchQueueItemId, setSelectedReviewWorkbenchQueueItemId] = useState<string | null>(null)
  const [page, setPage] = useState<'import' | 'batches' | 'detail' | 'search' | 'people' | 'person' | 'review' | 'review-workbench' | 'enrichment' | 'evidence' | 'preservation'>('import')

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

  const handleSelectEvidenceFile = (fileId: string) => {
    setSelectedEvidenceFileId(fileId)
    setPage('evidence')
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
          <button type="button" onClick={() => setPage('review-workbench')}>Review Workbench</button>
          <button type="button" onClick={() => setPage('preservation')}>Preservation</button>
          <button type="button" onClick={() => setPage('enrichment')}>Enrichment Jobs</button>
          <button type="button" onClick={() => setPage('evidence')}>Document Evidence</button>
        </nav>
      </header>

      {page === 'import' ? <ImportPage onSelectBatch={handleSelectBatch} /> : null}
      {page === 'batches' ? <BatchListPage batches={batches} onSelectBatch={handleSelectBatch} /> : null}
      {page === 'detail' ? <BatchDetailPage batch={selectedBatch} /> : null}
      {page === 'search' ? <SearchPage /> : null}
      {page === 'people' ? <PeoplePage onSelectPerson={handleSelectPerson} /> : null}
      {page === 'person' ? <PersonDetailPage canonicalPersonId={selectedCanonicalPersonId} /> : null}
      {page === 'review' ? <ReviewQueuePage onOpenWorkbench={(queueItemId) => { setSelectedReviewWorkbenchQueueItemId(queueItemId); setPage('review-workbench') }} /> : null}
      {page === 'review-workbench' ? <ReviewWorkbenchPage initialQueueItemId={selectedReviewWorkbenchQueueItemId} /> : null}
      {page === 'preservation' ? <PreservationPage /> : null}
      {page === 'enrichment' ? <EnrichmentJobsPage onSelectFile={handleSelectEvidenceFile} /> : null}
      {page === 'evidence' ? <DocumentEvidencePage fileId={selectedEvidenceFileId} /> : null}
    </main>
  )
}
