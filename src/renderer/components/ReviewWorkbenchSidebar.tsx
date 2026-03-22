import type { ReviewWorkbenchListItem } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

export function ReviewWorkbenchSidebar(props: {
  items: ReviewWorkbenchListItem[]
  selectedQueueItemId: string | null
  onSelect?: (queueItemId: string) => void
}) {
  const { t } = useI18n()

  return (
    <aside>
      <h2>{t('reviewWorkbench.sidebar.items')}</h2>
      {props.items.length === 0 ? <p>{t('reviewWorkbench.sidebar.none')}</p> : null}
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
            <div>{item.canonicalPersonName ?? t('personDossier.unassignedPerson')}</div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
