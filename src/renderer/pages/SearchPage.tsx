import { useMemo, useState } from 'react'
import type { ArchiveSearchResult, DecisionJournalSearchResult } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { SearchFilters } from '../components/SearchFilters'

export function SearchPage() {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [results, setResults] = useState<ArchiveSearchResult[]>([])
  const [decisionResults, setDecisionResults] = useState<DecisionJournalSearchResult[]>([])

  return (
    <section>
      <h2>Search</h2>
      <SearchFilters
        onSearch={async (input) => {
          const [archiveResults, journalResults] = await Promise.all([
            archiveApi.searchArchive(input),
            archiveApi.searchDecisionJournal({ query: input.query })
          ])
          setResults(archiveResults)
          setDecisionResults(journalResults)
        }}
      />
      <h3>Archive Results</h3>
      <ul>
        {results.map((result) => (
          <li key={result.fileId}>{result.fileName}</li>
        ))}
      </ul>
      <h3>Decision History</h3>
      <ul>
        {decisionResults.map((result) => (
          <li key={result.journalId}>{result.replaySummary}</li>
        ))}
      </ul>
    </section>
  )
}
