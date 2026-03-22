import { useState } from 'react'
import { useI18n } from '../i18n'

export function SearchFilters(props: {
  onSearch: (input: { query: string; fileKinds: string[] }) => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        props.onSearch({ query, fileKinds: [] })
      }}
    >
      <label>
        {t('search.filters.keyword')}
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <button type="submit">{t('search.filters.submit')}</button>
    </form>
  )
}
