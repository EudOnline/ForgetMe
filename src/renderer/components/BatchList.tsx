import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

export function BatchList(props: {
  batches: ImportBatchSummary[]
  onSelect?: (batchId: string) => void
}) {
  const { t } = useI18n()

  if (props.batches.length === 0) {
    return <p>{t('batches.noBatches')}</p>
  }

  return (
    <ul>
      {props.batches.map((batch) => (
        <li key={batch.batchId}>
          <button type="button" onClick={() => props.onSelect?.(batch.batchId)}>
            {batch.sourceLabel}
          </button>
        </li>
      ))}
    </ul>
  )
}
