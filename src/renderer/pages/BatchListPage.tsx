import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { BatchList } from '../components/BatchList'
import { useI18n } from '../i18n'

export function BatchListPage(props: {
  batches: ImportBatchSummary[]
  onSelectBatch?: (batchId: string) => void
}) {
  const { t } = useI18n()

  return (
    <section>
      <h2>{t('import.recentBatches')}</h2>
      <BatchList batches={props.batches} onSelect={props.onSelectBatch} />
    </section>
  )
}
