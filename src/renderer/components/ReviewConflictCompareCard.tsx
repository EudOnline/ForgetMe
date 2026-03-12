export type ReviewConflictCompareValueCount = {
  value: string
  count: number
}

export function ReviewConflictCompareCard(props: {
  fieldKey: string | null
  pendingCount: number
  distinctValuesWithCounts: ReviewConflictCompareValueCount[]
  hasConflict: boolean
}) {
  return (
    <section>
      <h2>Conflict Compare</h2>
      <dl>
        <dt>Field</dt>
        <dd>{props.fieldKey ?? 'unknown'}</dd>
        <dt>Status</dt>
        <dd>{props.hasConflict ? 'Conflict' : 'Aligned'}</dd>
        <dt>Pending</dt>
        <dd>{props.pendingCount}</dd>
        <dt>Distinct Values</dt>
        <dd>{props.distinctValuesWithCounts.length} values</dd>
      </dl>
      <ul>
        {props.distinctValuesWithCounts.map((entry) => (
          <li key={entry.value}>
            {entry.value} · {entry.count}
          </li>
        ))}
      </ul>
    </section>
  )
}
