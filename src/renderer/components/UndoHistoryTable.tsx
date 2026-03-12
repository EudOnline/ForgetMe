import type { DecisionJournalEntry } from '../../shared/archiveContracts'

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function formatDecision(entry: DecisionJournalEntry) {
  if (entry.targetType === 'decision_batch' && entry.decisionType === 'approve_safe_review_group') {
    return 'Safe batch approve'
  }

  return entry.decisionType
}

function formatTarget(entry: DecisionJournalEntry) {
  if (entry.targetType !== 'decision_batch') {
    return entry.targetType
  }

  const personName = readString(entry.operationPayload.canonicalPersonName)
  const fieldKey = readString(entry.operationPayload.fieldKey)
  const itemCount = readPositiveNumber(entry.operationPayload.itemCount)
  const summaryParts = [
    personName,
    fieldKey,
    itemCount ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : null
  ].filter((value): value is string => Boolean(value))

  if (summaryParts.length > 0) {
    return summaryParts.join(' · ')
  }

  return 'Decision batch'
}

function formatUndoLabel(entry: DecisionJournalEntry) {
  return entry.targetType === 'decision_batch' ? 'Undo Batch' : 'Undo'
}

export function UndoHistoryTable(props: {
  entries: DecisionJournalEntry[]
  onUndo?: (journalId: string) => void
}) {
  if (props.entries.length === 0) {
    return <p>No review history yet.</p>
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Decision</th>
          <th>Target</th>
          <th>Undo</th>
        </tr>
      </thead>
      <tbody>
        {props.entries.map((entry) => (
          <tr key={entry.id}>
            <td>{formatDecision(entry)}</td>
            <td>{formatTarget(entry)}</td>
            <td>
              {entry.undoneAt ? 'Undone' : (
                <button type="button" onClick={() => props.onUndo?.(entry.id)}>{formatUndoLabel(entry)}</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
