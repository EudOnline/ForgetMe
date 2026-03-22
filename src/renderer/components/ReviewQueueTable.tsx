import type { ReviewQueueItem } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'
import { CandidateDiffCard } from './CandidateDiffCard'

export function ReviewQueueTable(props: {
  items: ReviewQueueItem[]
  onApprove?: (queueItemId: string) => void
  onReject?: (queueItemId: string) => void
}) {
  const { t } = useI18n()

  if (props.items.length === 0) {
    return <p>{t('reviewQueue.noPending')}</p>
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>{t('reviewQueue.table.type')}</th>
            <th>{t('reviewQueue.table.status')}</th>
            <th>{t('reviewQueue.table.confidence')}</th>
            <th>{t('reviewQueue.table.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => (
            <tr key={item.id}>
              <td>{item.itemType}</td>
              <td>{item.status}</td>
              <td>{item.confidence}</td>
              <td>
                <button type="button" onClick={() => props.onApprove?.(item.id)}>{t('reviewQueue.action.approve')}</button>
                <button type="button" onClick={() => props.onReject?.(item.id)}>{t('reviewQueue.action.reject')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.items.map((item) => (
        <CandidateDiffCard key={`${item.id}-diff`} item={item} />
      ))}
    </div>
  )
}
