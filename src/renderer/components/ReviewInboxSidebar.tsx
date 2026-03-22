import type { ReviewInboxPersonSummary } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

export function ReviewInboxSidebar(props: {
  people: ReviewInboxPersonSummary[]
  selectedPersonKey: string | null
  onSelectPerson?: (person: ReviewInboxPersonSummary) => void | Promise<void>
  onShowAll?: () => void | Promise<void>
}) {
  const { t } = useI18n()

  return (
    <aside>
      <h2>{t('reviewWorkbench.inbox.title')}</h2>
      <button type="button" onClick={() => void props.onShowAll?.()} aria-pressed={props.selectedPersonKey === null}>
        {t('reviewWorkbench.inbox.allPending')}
      </button>
      {props.people.length === 0 ? <p>{t('reviewWorkbench.inbox.none')}</p> : null}
      <ul>
        {props.people.map((person) => {
          const personKey = person.canonicalPersonId ?? '__unassigned__'
          return (
            <li key={personKey}>
              <button
                type="button"
                onClick={() => void props.onSelectPerson?.(person)}
                aria-pressed={props.selectedPersonKey === personKey}
              >
                {person.canonicalPersonName}
              </button>
              <div>{t('reviewWorkbench.inbox.pending', { count: person.pendingCount })}</div>
              <div>{person.fieldKeys.join(', ') || t('reviewWorkbench.inbox.noFields')}</div>
              {person.conflictCount > 0 ? <div>{t('reviewWorkbench.inbox.conflicts', { count: person.conflictCount })}</div> : null}
              {person.hasContinuousSequence ? <div>{t('reviewWorkbench.inbox.continue')}</div> : null}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
