import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { BatchDetail } from '../components/BatchDetail'

export function BatchDetailPage(props: { batch: ImportBatchSummary | null }) {
  return <BatchDetail batch={props.batch} />
}
