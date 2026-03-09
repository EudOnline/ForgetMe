import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { FileTable } from './FileTable'

export function BatchDetail(props: { batch: ImportBatchSummary | null }) {
  return (
    <section>
      <h2>Batch Detail</h2>
      {props.batch ? <p>{props.batch.sourceLabel}</p> : <p>Select a batch.</p>}
      <FileTable batch={props.batch} />
    </section>
  )
}
