import { useEffect, useMemo, useState } from 'react'
import { APP_NAME } from '../shared/archiveTypes'
import type {
  GroupPortraitReplayShortcut,
  MemoryWorkspaceCitation,
  MemoryWorkspaceScope,
  ImportBatchSummary,
  PersonDossierReviewShortcut
} from '../shared/archiveContracts'
import { getArchiveApi } from './archiveApi'
import { BatchDetailPage } from './pages/BatchDetailPage'
import { BatchListPage } from './pages/BatchListPage'
import { DocumentEvidencePage } from './pages/DocumentEvidencePage'
import { EnrichmentJobsPage } from './pages/EnrichmentJobsPage'
import { GroupPortraitPage } from './pages/GroupPortraitPage'
import { ImportPage } from './pages/ImportPage'
import { MemoryWorkspacePage } from './pages/MemoryWorkspacePage'
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
  const [selectedMemoryWorkspaceScope, setSelectedMemoryWorkspaceScope] = useState<MemoryWorkspaceScope>({ kind: 'global' })
  const [selectedEvidenceFileId, setSelectedEvidenceFileId] = useState<string | null>(null)
  const [selectedReviewWorkbenchQueueItemId, setSelectedReviewWorkbenchQueueItemId] = useState<string | null>(null)
  const [selectedReviewHistoryQuery, setSelectedReviewHistoryQuery] = useState<string | null>(null)
  const [selectedReviewHistoryJournalId, setSelectedReviewHistoryJournalId] = useState<string | null>(null)
  const [page, setPage] = useState<'import' | 'batches' | 'detail' | 'search' | 'people' | 'person' | 'group-portrait' | 'memory-workspace' | 'review' | 'review-workbench' | 'enrichment' | 'evidence' | 'preservation'>('import')

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

  const handleOpenReviewWorkbenchFromDossier = (shortcut: PersonDossierReviewShortcut) => {
    setSelectedReviewWorkbenchQueueItemId(shortcut.queueItemId ?? null)
    setPage('review-workbench')
  }

  const handleOpenReplayHistoryFromGroupPortrait = (shortcut: GroupPortraitReplayShortcut) => {
    setSelectedReviewHistoryQuery(shortcut.query)
    setSelectedReviewHistoryJournalId(shortcut.journalId)
    setPage('review')
  }

  const handleOpenGroupPortrait = (canonicalPersonId: string) => {
    setSelectedCanonicalPersonId(canonicalPersonId)
    setPage('group-portrait')
  }

  const handleOpenMemoryWorkspace = (scope: MemoryWorkspaceScope) => {
    setSelectedMemoryWorkspaceScope(scope)
    setPage('memory-workspace')
  }

  const handleOpenReviewHistoryFromMemoryCitation = (citation: MemoryWorkspaceCitation) => {
    setSelectedReviewHistoryQuery(citation.targetId)
    setSelectedReviewHistoryJournalId(citation.kind === 'journal' ? citation.targetId : null)
    setPage('review')
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
          <button type="button" onClick={() => { setSelectedCanonicalPersonId(null); setPage('group-portrait') }}>Group Portrait</button>
          <button type="button" onClick={() => { setSelectedMemoryWorkspaceScope({ kind: 'global' }); setPage('memory-workspace') }}>Memory Workspace</button>
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
      {page === 'person' ? (
        <PersonDetailPage
          canonicalPersonId={selectedCanonicalPersonId}
          onOpenEvidenceFile={handleSelectEvidenceFile}
          onOpenReviewWorkbench={handleOpenReviewWorkbenchFromDossier}
          onOpenGroupPortrait={handleOpenGroupPortrait}
          onOpenMemoryWorkspace={handleOpenMemoryWorkspace}
        />
      ) : null}
      {page === 'group-portrait' ? (
        <GroupPortraitPage
          canonicalPersonId={selectedCanonicalPersonId}
          onOpenGroupPortrait={handleOpenGroupPortrait}
          onOpenEvidenceFile={handleSelectEvidenceFile}
          onOpenPerson={handleSelectPerson}
          onOpenReviewWorkbench={handleOpenReviewWorkbenchFromDossier}
          onOpenReplayHistory={handleOpenReplayHistoryFromGroupPortrait}
          onOpenMemoryWorkspace={handleOpenMemoryWorkspace}
        />
      ) : null}
      {page === 'memory-workspace' ? (
        <MemoryWorkspacePage
          scope={selectedMemoryWorkspaceScope}
          onOpenPerson={handleSelectPerson}
          onOpenGroup={handleOpenGroupPortrait}
          onOpenEvidenceFile={handleSelectEvidenceFile}
          onOpenReviewHistory={handleOpenReviewHistoryFromMemoryCitation}
        />
      ) : null}
      {page === 'review' ? (
        <ReviewQueuePage
          onOpenWorkbench={(queueItemId) => { setSelectedReviewWorkbenchQueueItemId(queueItemId); setPage('review-workbench') }}
          initialJournalQuery={selectedReviewHistoryQuery}
          initialSelectedJournalId={selectedReviewHistoryJournalId}
        />
      ) : null}
      {page === 'review-workbench' ? <ReviewWorkbenchPage initialQueueItemId={selectedReviewWorkbenchQueueItemId} /> : null}
      {page === 'preservation' ? <PreservationPage /> : null}
      {page === 'enrichment' ? <EnrichmentJobsPage onSelectFile={handleSelectEvidenceFile} /> : null}
      {page === 'evidence' ? <DocumentEvidencePage fileId={selectedEvidenceFileId} /> : null}
    </main>
  )
}
