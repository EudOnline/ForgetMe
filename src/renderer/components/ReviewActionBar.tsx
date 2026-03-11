export function ReviewActionBar(props: {
  queueStatus: string
  undoJournalId: string | null
  busy?: boolean
  onApprove?: () => void
  onReject?: () => void
  onUndo?: () => void
}) {
  const pending = props.queueStatus === 'pending'

  return (
    <section>
      <h2>Actions</h2>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => props.onApprove?.()} disabled={!pending || props.busy}>Approve</button>
        <button type="button" onClick={() => props.onReject?.()} disabled={!pending || props.busy}>Reject</button>
        <button type="button" onClick={() => props.onUndo?.()} disabled={!props.undoJournalId || props.busy}>Undo</button>
      </div>
    </section>
  )
}
