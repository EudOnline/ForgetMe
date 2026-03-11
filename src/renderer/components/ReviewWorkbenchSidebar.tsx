import type { ReviewWorkbenchListItem } from '../../shared/archiveContracts'

export function ReviewWorkbenchSidebar(props: {
  items: ReviewWorkbenchListItem[]
  selectedQueueItemId: string | null
  onSelect?: (queueItemId: string) => void
}) {
  return (
    <aside>
      <h2>Workbench Items</h2>
      {props.items.length === 0 ? <p>No review workbench items.</p> : null}
      <ul>
        {props.items.map((item) => (
          <li key={item.queueItemId}>
            <button
              type="button"
              onClick={() => props.onSelect?.(item.queueItemId)}
              aria-pressed={props.selectedQueueItemId === item.queueItemId}
            >
              {item.displayValue || item.fieldKey || item.itemType}
            </button>
            <div>{item.itemType}</div>
            <div>{item.canonicalPersonName ?? 'Unassigned person'}</div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
