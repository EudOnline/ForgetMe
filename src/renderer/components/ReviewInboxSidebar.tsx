import type { ReviewInboxPersonSummary } from '../../shared/archiveContracts'

export function ReviewInboxSidebar(props: {
  people: ReviewInboxPersonSummary[]
  selectedPersonKey: string | null
  onSelectPerson?: (person: ReviewInboxPersonSummary) => void | Promise<void>
  onShowAll?: () => void | Promise<void>
}) {
  return (
    <aside>
      <h2>People Inbox</h2>
      <button type="button" onClick={() => void props.onShowAll?.()} aria-pressed={props.selectedPersonKey === null}>
        All Pending
      </button>
      {props.people.length === 0 ? <p>No people with pending review items.</p> : null}
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
              <div>{person.pendingCount} pending</div>
              <div>{person.fieldKeys.join(', ') || 'No fields'}</div>
              {person.conflictCount > 0 ? <div>{person.conflictCount} conflicts</div> : null}
              {person.hasContinuousSequence ? <div>Continue available</div> : null}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
