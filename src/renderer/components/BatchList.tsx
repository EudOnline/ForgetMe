import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

function getBatchCounts(batch: ImportBatchSummary) {
  return {
    importedCount: batch.summary?.frozenCount ?? batch.files?.length ?? 0,
    parsedCount: batch.summary?.parsedCount ?? batch.files?.filter((file) => file.parserStatus === 'parsed').length ?? 0,
    duplicateCount:
      batch.summary?.duplicateCount ?? batch.files?.filter((file) => file.duplicateClass === 'duplicate_exact').length ?? 0,
    reviewCount: batch.summary?.reviewCount ?? 0
  }
}

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
      {props.batches.map((batch) => {
        const counts = getBatchCounts(batch)

        return (
          <li key={batch.batchId}>
          <button type="button" onClick={() => props.onSelect?.(batch.batchId)}>
            {batch.sourceLabel}
          </button>
            <p>
              {t('batch.list.meta', {
                importedCount: counts.importedCount,
                parsedCount: counts.parsedCount,
                duplicateCount: counts.duplicateCount,
                reviewCount: counts.reviewCount
              })}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
