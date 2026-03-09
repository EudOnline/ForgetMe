import { useMemo, useState } from 'react'
import type { ArchiveSearchResult } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { SearchFilters } from '../components/SearchFilters'

export function SearchPage() {
  const archiveApi = useMemo(() => getArchiveApi(), [])
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
