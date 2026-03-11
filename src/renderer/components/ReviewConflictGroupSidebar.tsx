import type { ReviewConflictGroupSummary } from '../../shared/archiveContracts'

export function ReviewConflictGroupSidebar(props: {
  groups: ReviewConflictGroupSummary[]
  selectedGroupKey: string | null
  onSelectGroup?: (group: ReviewConflictGroupSummary) => void | Promise<void>
  onShowAll?: () => void | Promise<void>
}) {
  return (
    <aside>
      <h2>Conflict Groups</h2>
      <button type="button" onClick={() => void props.onShowAll?.()} aria-pressed={props.selectedGroupKey === null}>
        All Fields
      </button>
      {props.groups.length === 0 ? <p>No conflict groups in current scope.</p> : null}
      <ul>
        {props.groups.map((group) => (
          <li key={group.groupKey}>
            <button
              type="button"
              onClick={() => void props.onSelectGroup?.(group)}
              aria-pressed={props.selectedGroupKey === group.groupKey}
            >
              {group.fieldKey ?? group.itemType}
            </button>
            <div>{group.pendingCount} pending</div>
            <div>{group.distinctValues.join(', ') || 'No values'}</div>
            <div>{group.hasConflict ? 'Conflict' : 'Consensus'}</div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
