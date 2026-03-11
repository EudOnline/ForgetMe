import type { StructuredFieldCandidate } from '../../shared/archiveContracts'

export function StructuredFieldCandidateTable(props: {
  candidates: StructuredFieldCandidate[]
  onApprove?: (queueItemId: string) => void | Promise<void>
  onReject?: (queueItemId: string) => void | Promise<void>
}) {
  if (props.candidates.length === 0) {
    return <p>No structured field candidates.</p>
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Value</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {props.candidates.map((candidate) => (
          <tr key={candidate.id}>
            <td>{candidate.fieldKey}</td>
            <td>{candidate.fieldValue}</td>
            <td>{candidate.status}</td>
            <td>
              <button type="button" disabled={!candidate.queueItemId} onClick={() => candidate.queueItemId && void props.onApprove?.(candidate.queueItemId)}>Approve</button>
              <button type="button" disabled={!candidate.queueItemId} onClick={() => candidate.queueItemId && void props.onReject?.(candidate.queueItemId)}>Reject</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
