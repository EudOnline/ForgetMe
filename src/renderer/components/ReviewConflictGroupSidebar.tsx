import type { ReviewConflictGroupSummary } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

export function ReviewConflictGroupSidebar(props: {
  groups: ReviewConflictGroupSummary[]
  selectedGroupKey: string | null
  onSelectGroup?: (group: ReviewConflictGroupSummary) => void | Promise<void>
  onShowAll?: () => void | Promise<void>
}) {
  const { t } = useI18n()

  return (
    <aside>
      <h2>{t('reviewWorkbench.conflictGroups.title')}</h2>
      <button type="button" onClick={() => void props.onShowAll?.()} aria-pressed={props.selectedGroupKey === null}>
        {t('reviewWorkbench.conflictGroups.allFields')}
      </button>
      {props.groups.length === 0 ? <p>{t('reviewWorkbench.conflictGroups.none')}</p> : null}
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
            <div>{t('reviewWorkbench.inbox.pending', { count: group.pendingCount })}</div>
            <div>{group.distinctValues.join(', ') || t('reviewWorkbench.conflictGroups.noValues')}</div>
            <div>{group.hasConflict ? t('reviewWorkbench.conflictGroups.conflict') : t('reviewWorkbench.conflictGroups.consensus')}</div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
