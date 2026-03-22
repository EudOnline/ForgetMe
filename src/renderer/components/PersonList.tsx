import type { CanonicalPersonSummary } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

export function PersonList(props: {
  people: CanonicalPersonSummary[]
  onSelect?: (canonicalPersonId: string) => void
}) {
  const { t } = useI18n()

  if (props.people.length === 0) {
    return <p>{t('people.noApprovedPeople')}</p>
  }

  return (
    <ul>
      {props.people.map((person) => (
        <li key={person.id}>
          <button type="button" onClick={() => props.onSelect?.(person.id)}>
            {person.primaryDisplayName}
          </button>
          <span> ({person.evidenceCount})</span>
        </li>
      ))}
    </ul>
  )
}
