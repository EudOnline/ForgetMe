import type { ReviewWorkbenchDetail } from '../../shared/archiveContracts'

export function ReviewCandidateSummaryCard(props: {
  detail: ReviewWorkbenchDetail
}) {
  const { item, candidate, queueItem } = props.detail

  return (
    <section>
      <h2>Candidate Detail</h2>
      <dl>
        <dt>Type</dt>
        <dd>{item.itemType}</dd>
        <dt>Field</dt>
        <dd>{item.fieldKey ?? 'unknown'}</dd>
        <dt>Value</dt>
        <dd>{item.displayValue || 'unknown'}</dd>
        <dt>Person</dt>
        <dd>{item.canonicalPersonName ?? 'Unassigned person'}</dd>
        <dt>Status</dt>
        <dd>{queueItem.status}</dd>
        <dt>Confidence</dt>
        <dd>{queueItem.confidence}</dd>
      </dl>
      {candidate ? <pre>{JSON.stringify(candidate, null, 2)}</pre> : <p>No candidate payload.</p>}
    </section>
  )
}
