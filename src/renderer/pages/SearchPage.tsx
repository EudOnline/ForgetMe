import { useMemo, useState } from 'react'
import type { ArchiveSearchResult, DecisionJournalSearchResult } from '../../shared/archiveContracts'
import { getImportClient } from '../clients/importClient'
import { getReviewClient } from '../clients/reviewClient'
import { useI18n } from '../i18n'
import { SearchFilters } from '../components/SearchFilters'

export function SearchPage() {
  const { t } = useI18n()
  const importClient = useMemo(() => getImportClient(), [])
  const reviewClient = useMemo(() => getReviewClient(), [])
  const [results, setResults] = useState<ArchiveSearchResult[]>([])
  const [decisionResults, setDecisionResults] = useState<DecisionJournalSearchResult[]>([])

  return (
    <section>
      <h2>{t('search.title')}</h2>
      <SearchFilters
        onSearch={async (input) => {
          const [archiveResults, journalResults] = await Promise.all([
            importClient.searchArchive(input),
            reviewClient.searchDecisionJournal({ query: input.query })
          ])
          setResults(archiveResults)
          setDecisionResults(journalResults)
        }}
      />
      <h3>{t('search.archiveResults')}</h3>
      <ul>
        {results.map((result) => (
          <li key={result.fileId}>{result.fileName}</li>
        ))}
      </ul>
      <h3>{t('search.decisionHistory')}</h3>
      <ul>
        {decisionResults.map((result) => (
          <li key={result.journalId}>{result.replaySummary}</li>
        ))}
      </ul>
    </section>
  )
}
