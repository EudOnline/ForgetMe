import { useMemo, useState } from 'react'
import type { ArchiveSearchResult } from '../../shared/archiveContracts'
import { SearchFilters } from '../components/SearchFilters'

const fallbackApi = {
  searchArchive: async () => [] as ArchiveSearchResult[]
}

export function SearchPage() {
  const archiveApi = useMemo(() => window.archiveApi ?? fallbackApi, [])
  const [results, setResults] = useState<ArchiveSearchResult[]>([])

  return (
    <section>
      <h2>Search</h2>
      <SearchFilters
        onSearch={async (input) => {
          setResults(await archiveApi.searchArchive(input))
        }}
      />
      <ul>
        {results.map((result) => (
          <li key={result.fileId}>{result.fileName}</li>
        ))}
      </ul>
    </section>
  )
}
