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
import { useI18n } from './i18n'
import { BatchDetailPage } from './pages/BatchDetailPage'
import { AgentConsolePage } from './pages/AgentConsolePage'
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

type Page =
  | 'import'
  | 'batches'
  | 'detail'
  | 'search'
  | 'people'
  | 'person'
  | 'group-portrait'
  | 'memory-workspace'
  | 'review'
  | 'review-workbench'
  | 'enrichment'
  | 'evidence'
  | 'preservation'
  | 'agent-console'

export default function App() {
  const { language, setLanguage, t } = useI18n()
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [batches, setBatches] = useState<ImportBatchSummary[]>([])
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchSummary | null>(null)
  const [selectedCanonicalPersonId, setSelectedCanonicalPersonId] = useState<string | null>(null)
  const [selectedMemoryWorkspaceScope, setSelectedMemoryWorkspaceScope] = useState<MemoryWorkspaceScope>({ kind: 'global' })
  const [selectedEvidenceFileId, setSelectedEvidenceFileId] = useState<string | null>(null)
  const [selectedReviewWorkbenchQueueItemId, setSelectedReviewWorkbenchQueueItemId] = useState<string | null>(null)
  const [selectedReviewHistoryQuery, setSelectedReviewHistoryQuery] = useState<string | null>(null)
  const [selectedReviewHistoryJournalId, setSelectedReviewHistoryJournalId] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('import')

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

  const pageLabelKeys: Record<Page, string> = {
    import: 'page.capture.import',
    batches: 'page.capture.batches',
    detail: 'page.capture.batchDetail',
    search: 'page.explore.search',
    people: 'page.explore.people',
    person: 'page.explore.person',
    'group-portrait': 'page.explore.groupPortrait',
    'memory-workspace': 'page.workspace.memory',
    review: 'page.review.queue',
    'review-workbench': 'page.review.workbench',
    preservation: 'page.ops.preservation',
    enrichment: 'page.ops.enrichmentJobs',
    evidence: 'page.evidence.document',
    'agent-console': 'page.ops.agentConsole'
  }

  return (
    <main className="fmApp">
      <header className="fmTop">
        <div className="fmBrand">
          <div className="fmBrandMark" aria-hidden="true" />
          <div className="fmBrandText">
            <div className="fmBrandName">{APP_NAME}</div>
            <div className="fmBrandTag">{t(pageLabelKeys[page])}</div>
          </div>
        </div>
        <div className="fmTopMeta">
          <span>{t('app.tagline')}</span>
          <label className="fmLang">
            <span className="fmLangLabel">{t('app.language')}</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
              aria-label={t('app.language')}
            >
              <option value="en">{t('app.language.en')}</option>
              <option value="zh-CN">{t('app.language.zh-CN')}</option>
            </select>
          </label>
        </div>
      </header>

      <div className="fmShell">
        <nav className="fmNav" aria-label="Primary navigation">
          <div className="fmNavGroup">
            <div className="fmNavLabel">{t('nav.group.capture')}</div>
            <ul className="fmNavItems">
              <li>
                <button className="fmNavItem" type="button" onClick={() => setPage('import')} aria-current={page === 'import' ? 'page' : undefined}>
                  {t('nav.import')}
                </button>
              </li>
              <li>
                <button className="fmNavItem" type="button" onClick={() => setPage('batches')} aria-current={page === 'batches' || page === 'detail' ? 'page' : undefined}>
                  {t('nav.batches')}
                </button>
              </li>
            </ul>
          </div>

          <div className="fmNavGroup">
            <div className="fmNavLabel">{t('nav.group.explore')}</div>
            <ul className="fmNavItems">
              <li>
                <button className="fmNavItem" type="button" onClick={() => setPage('search')} aria-current={page === 'search' ? 'page' : undefined}>
                  {t('nav.search')}
                </button>
              </li>
              <li>
                <button className="fmNavItem" type="button" onClick={() => setPage('people')} aria-current={page === 'people' || page === 'person' ? 'page' : undefined}>
                  {t('nav.people')}
                </button>
              </li>
              <li>
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => {
                    setSelectedCanonicalPersonId(null)
                    setPage('group-portrait')
                  }}
                  aria-current={page === 'group-portrait' ? 'page' : undefined}
                >
                  {t('nav.groupPortrait')}
                </button>
              </li>
            </ul>
          </div>

          <div className="fmNavGroup">
            <div className="fmNavLabel">{t('nav.group.workspace')}</div>
            <ul className="fmNavItems">
              <li>
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => {
                    setSelectedMemoryWorkspaceScope({ kind: 'global' })
                    setPage('memory-workspace')
                  }}
                  aria-current={page === 'memory-workspace' ? 'page' : undefined}
                >
                  {t('nav.memoryWorkspace')}
                </button>
              </li>
            </ul>
          </div>

          <div className="fmNavGroup">
            <div className="fmNavLabel">{t('nav.group.review')}</div>
            <ul className="fmNavItems">
              <li>
                <button className="fmNavItem" type="button" onClick={() => setPage('review')} aria-current={page === 'review' ? 'page' : undefined}>
                  {t('nav.reviewQueue')}
                </button>
              </li>
              <li>
                <button className="fmNavItem" type="button" onClick={() => setPage('review-workbench')} aria-current={page === 'review-workbench' ? 'page' : undefined}>
                  {t('nav.reviewWorkbench')}
                </button>
              </li>
            </ul>
          </div>

          <div className="fmNavGroup">
            <div className="fmNavLabel">{t('nav.group.ops')}</div>
            <ul className="fmNavItems">
              <li>
                <button className="fmNavItem" type="button" onClick={() => setPage('preservation')} aria-current={page === 'preservation' ? 'page' : undefined}>
                  {t('nav.preservation')}
                </button>
              </li>
              <li>
                <button className="fmNavItem" type="button" onClick={() => setPage('enrichment')} aria-current={page === 'enrichment' ? 'page' : undefined}>
                  {t('nav.enrichmentJobs')}
                </button>
              </li>
              <li>
                <button className="fmNavItem" type="button" onClick={() => setPage('evidence')} aria-current={page === 'evidence' ? 'page' : undefined}>
                  {t('nav.documentEvidence')}
                </button>
              </li>
              <li>
                <button className="fmNavItem" type="button" onClick={() => setPage('agent-console')} aria-current={page === 'agent-console' ? 'page' : undefined}>
                  {t('nav.agentConsole')}
                </button>
              </li>
            </ul>
          </div>
        </nav>

        <section className="fmContent" data-page={page} aria-label="Content">
          <div className="fmContentInner">
            {page === 'import' ? <ImportPage onSelectBatch={handleSelectBatch} onBatchesUpdated={setBatches} /> : null}
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
            {page === 'agent-console' ? (
              <AgentConsolePage
                onOpenReviewQueue={() => setPage('review')}
                onOpenMemoryWorkspace={(scope) => {
                  setSelectedMemoryWorkspaceScope(scope)
                  setPage('memory-workspace')
                }}
              />
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}
