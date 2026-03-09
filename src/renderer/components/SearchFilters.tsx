import { useState } from 'react'

export function SearchFilters(props: {
  onSearch: (input: { query: string; fileKinds: string[] }) => void
}) {
  const [query, setQuery] = useState('')

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        props.onSearch({ query, fileKinds: [] })
      }}
    >
      <label>
        Keyword
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <button type="submit">Search</button>
    </form>
  )
}
