import { useEffect, useMemo, useReducer, useState } from 'react'
import { APP_NAME } from '../../shared/archiveTypes'
import type {
  GroupPortraitReplayShortcut,
  ImportBatchSummary,
  MemoryWorkspaceCitation,
  PersonDossierReviewShortcut
} from '../../shared/archiveContracts'
import { getImportClient } from '../clients/importClient'
import { useI18n } from '../i18n'
import { BatchDetailPage } from '../pages/BatchDetailPage'
import { BatchListPage } from '../pages/BatchListPage'
import { DocumentEvidencePage } from '../pages/DocumentEvidencePage'
import { EnrichmentJobsPage } from '../pages/EnrichmentJobsPage'
import { GroupPortraitPage } from '../pages/GroupPortraitPage'
import { ImportPage } from '../pages/ImportPage'
import { MemoryWorkspacePage } from '../pages/MemoryWorkspacePage'
import { ObjectiveWorkbenchPage } from '../pages/ObjectiveWorkbenchPage'
import { PeoplePage } from '../pages/PeoplePage'
import { PersonDetailPage } from '../pages/PersonDetailPage'
import { PreservationPage } from '../pages/PreservationPage'
import { ReviewQueuePage } from '../pages/ReviewQueuePage'
import { ReviewWorkbenchPage } from '../pages/ReviewWorkbenchPage'
import { SearchPage } from '../pages/SearchPage'
import {
  openBatchDetail,
  openBatches,
  openDocumentEvidence,
  openEnrichment,
  openGroupPortrait,
  openImport,
  openMemoryWorkspace,
  openObjectiveWorkbench,
  openPeople,
  openPersonDetail,
  openPreservation,
  openReviewQueue,
  openReviewQueueFromCitation,
  openReviewWorkbench,
  openSearch
} from './navigation'
import { createInitialAppShellState, reduceAppShellState } from './appReducer'
import { pageLabelKeyForRoute } from './routeState'

function navMatches(routeKind: string, activeRouteKind: string) {
  if (routeKind === 'batches') {
    return activeRouteKind === 'batches' || activeRouteKind === 'batch-detail'
  }

  if (routeKind === 'people') {
    return activeRouteKind === 'people' || activeRouteKind === 'person-detail'
  }

  return routeKind === activeRouteKind
}

export default function AppShell() {
  const { language, setLanguage, t } = useI18n()
  const importClient = useMemo(() => getImportClient(), [])
  const [state, dispatch] = useReducer(reduceAppShellState, undefined, createInitialAppShellState)
  const [batches, setBatches] = useState<ImportBatchSummary[]>([])
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchSummary | null>(null)

  useEffect(() => {
    void importClient.listImportBatches().then(setBatches)
  }, [importClient])

  useEffect(() => {
    if (state.route.kind !== 'batch-detail') {
      setSelectedBatch(null)
      return
    }

    let cancelled = false
    void importClient.getImportBatch(state.route.batchId).then((batch) => {
      if (!cancelled) {
        setSelectedBatch(batch)
      }
    })

    return () => {
      cancelled = true
    }
  }, [importClient, state.route])

  const handleSelectBatch = (batchId: string) => {
    dispatch(openBatchDetail(batchId))
  }

  const handleOpenReviewWorkbenchFromDossier = (shortcut: PersonDossierReviewShortcut) => {
    dispatch(openReviewWorkbench(shortcut.queueItemId ?? null))
  }

  const handleOpenReplayHistoryFromGroupPortrait = (shortcut: GroupPortraitReplayShortcut) => {
    dispatch(openReviewQueue({
      initialJournalQuery: shortcut.query,
      initialSelectedJournalId: shortcut.journalId
    }))
  }

  const handleOpenReviewHistoryFromMemoryCitation = (citation: MemoryWorkspaceCitation) => {
    dispatch(openReviewQueueFromCitation(citation))
  }

  const route = state.route

  return (
    <main className="fmApp">
      <header className="fmTop">
        <div className="fmBrand">
          <div className="fmBrandMark" aria-hidden="true" />
          <div className="fmBrandText">
            <div className="fmBrandName">{APP_NAME}</div>
            <div className="fmBrandTag">{t(pageLabelKeyForRoute(route))}</div>
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
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => dispatch(openImport())}
                  aria-current={navMatches('import', route.kind) ? 'page' : undefined}
                >
                  {t('nav.import')}
                </button>
              </li>
              <li>
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => dispatch(openBatches())}
                  aria-current={navMatches('batches', route.kind) ? 'page' : undefined}
                >
                  {t('nav.batches')}
                </button>
              </li>
            </ul>
          </div>

          <div className="fmNavGroup">
            <div className="fmNavLabel">{t('nav.group.explore')}</div>
            <ul className="fmNavItems">
              <li>
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => dispatch(openSearch())}
                  aria-current={navMatches('search', route.kind) ? 'page' : undefined}
                >
                  {t('nav.search')}
                </button>
              </li>
              <li>
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => dispatch(openPeople())}
                  aria-current={navMatches('people', route.kind) ? 'page' : undefined}
                >
                  {t('nav.people')}
                </button>
              </li>
              <li>
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => dispatch(openGroupPortrait(null))}
                  aria-current={navMatches('group-portrait', route.kind) ? 'page' : undefined}
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
                  onClick={() => dispatch(openMemoryWorkspace({ kind: 'global' }))}
                  aria-current={navMatches('memory-workspace', route.kind) ? 'page' : undefined}
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
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => dispatch(openReviewQueue())}
                  aria-current={navMatches('review-queue', route.kind) ? 'page' : undefined}
                >
                  {t('nav.reviewQueue')}
                </button>
              </li>
              <li>
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => dispatch(openReviewWorkbench())}
                  aria-current={navMatches('review-workbench', route.kind) ? 'page' : undefined}
                >
                  {t('nav.reviewWorkbench')}
                </button>
              </li>
            </ul>
          </div>

          <div className="fmNavGroup">
            <div className="fmNavLabel">{t('nav.group.ops')}</div>
            <ul className="fmNavItems">
              <li>
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => dispatch(openPreservation())}
                  aria-current={navMatches('preservation', route.kind) ? 'page' : undefined}
                >
                  {t('nav.preservation')}
                </button>
              </li>
              <li>
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => dispatch(openEnrichment())}
                  aria-current={navMatches('enrichment', route.kind) ? 'page' : undefined}
                >
                  {t('nav.enrichmentJobs')}
                </button>
              </li>
              <li>
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => dispatch(openDocumentEvidence(null))}
                  aria-current={navMatches('document-evidence', route.kind) ? 'page' : undefined}
                >
                  {t('nav.documentEvidence')}
                </button>
              </li>
              <li>
                <button
                  className="fmNavItem"
                  type="button"
                  onClick={() => dispatch(openObjectiveWorkbench())}
                  aria-current={navMatches('objective-workbench', route.kind) ? 'page' : undefined}
                >
                  {t('nav.objectiveWorkbench')}
                </button>
              </li>
            </ul>
          </div>
        </nav>

        <section className="fmContent" data-page={route.kind} aria-label="Content">
          <div className="fmContentInner">
            {route.kind === 'import' ? (
              <ImportPage
                onSelectBatch={handleSelectBatch}
                onBatchesUpdated={setBatches}
                onOpenReviewQueue={() => dispatch(openReviewQueue())}
              />
            ) : null}
            {route.kind === 'batches' ? <BatchListPage batches={batches} onSelectBatch={handleSelectBatch} /> : null}
            {route.kind === 'batch-detail' ? <BatchDetailPage batch={selectedBatch} /> : null}
            {route.kind === 'search' ? <SearchPage /> : null}
            {route.kind === 'people' ? <PeoplePage onSelectPerson={(canonicalPersonId) => dispatch(openPersonDetail(canonicalPersonId))} /> : null}
            {route.kind === 'person-detail' ? (
              <PersonDetailPage
                canonicalPersonId={route.canonicalPersonId}
                onOpenEvidenceFile={(fileId) => dispatch(openDocumentEvidence(fileId))}
                onOpenReviewWorkbench={handleOpenReviewWorkbenchFromDossier}
                onOpenGroupPortrait={(canonicalPersonId) => dispatch(openGroupPortrait(canonicalPersonId))}
                onOpenMemoryWorkspace={(scope) => dispatch(openMemoryWorkspace(scope))}
              />
            ) : null}
            {route.kind === 'group-portrait' ? (
              <GroupPortraitPage
                canonicalPersonId={route.canonicalPersonId}
                onOpenGroupPortrait={(canonicalPersonId) => dispatch(openGroupPortrait(canonicalPersonId))}
                onOpenEvidenceFile={(fileId) => dispatch(openDocumentEvidence(fileId))}
                onOpenPerson={(canonicalPersonId) => dispatch(openPersonDetail(canonicalPersonId))}
                onOpenReviewWorkbench={handleOpenReviewWorkbenchFromDossier}
                onOpenReplayHistory={handleOpenReplayHistoryFromGroupPortrait}
                onOpenMemoryWorkspace={(scope) => dispatch(openMemoryWorkspace(scope))}
              />
            ) : null}
            {route.kind === 'memory-workspace' ? (
              <MemoryWorkspacePage
                scope={route.scope}
                onOpenPerson={(canonicalPersonId) => dispatch(openPersonDetail(canonicalPersonId))}
                onOpenGroup={(canonicalPersonId) => dispatch(openGroupPortrait(canonicalPersonId))}
                onOpenEvidenceFile={(fileId) => dispatch(openDocumentEvidence(fileId))}
                onOpenReviewHistory={handleOpenReviewHistoryFromMemoryCitation}
              />
            ) : null}
            {route.kind === 'review-queue' ? (
              <ReviewQueuePage
                onOpenWorkbench={(queueItemId) => dispatch(openReviewWorkbench(queueItemId))}
                initialJournalQuery={route.initialJournalQuery}
                initialSelectedJournalId={route.initialSelectedJournalId}
              />
            ) : null}
            {route.kind === 'review-workbench' ? <ReviewWorkbenchPage initialQueueItemId={route.initialQueueItemId} /> : null}
            {route.kind === 'preservation' ? <PreservationPage /> : null}
            {route.kind === 'enrichment' ? <EnrichmentJobsPage onSelectFile={(fileId) => dispatch(openDocumentEvidence(fileId))} /> : null}
            {route.kind === 'document-evidence' ? <DocumentEvidencePage fileId={route.fileId} /> : null}
            {route.kind === 'objective-workbench' ? <ObjectiveWorkbenchPage /> : null}
          </div>
        </section>
      </div>
    </main>
  )
}
