import type { ReviewQueueItem } from '../../shared/archiveContracts'
import { CandidateDiffCard } from './CandidateDiffCard'

export function ReviewQueueTable(props: {
  items: ReviewQueueItem[]
  onApprove?: (queueItemId: string) => void
  onReject?: (queueItemId: string) => void
}) {
  if (props.items.length === 0) {
    return <p>No pending review items.</p>
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Status</th>
            <th>Confidence</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => (
            <tr key={item.id}>
              <td>{item.itemType}</td>
              <td>{item.status}</td>
              <td>{item.confidence}</td>
              <td>
                <button type="button" onClick={() => props.onApprove?.(item.id)}>Approve</button>
                <button type="button" onClick={() => props.onReject?.(item.id)}>Reject</button>
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
