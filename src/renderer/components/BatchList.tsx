import type { ImportBatchSummary } from '../../shared/archiveContracts'

export function BatchList(props: {
  batches: ImportBatchSummary[]
  onSelect?: (batchId: string) => void
}) {
  if (props.batches.length === 0) {
    return <p>No batches imported yet.</p>
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
