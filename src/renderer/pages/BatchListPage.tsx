import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { BatchList } from '../components/BatchList'

export function BatchListPage(props: {
  batches: ImportBatchSummary[]
  onSelectBatch?: (batchId: string) => void
}) {
  return (
    <section>
      <h2>Recent Batches</h2>
      <BatchList batches={props.batches} onSelect={props.onSelectBatch} />
    </section>
  )
}
