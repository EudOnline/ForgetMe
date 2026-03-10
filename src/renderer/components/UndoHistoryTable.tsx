import type { DecisionJournalEntry } from '../../shared/archiveContracts'

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
            <td>{entry.decisionType}</td>
            <td>{entry.targetType}</td>
            <td>
              {entry.undoneAt ? 'Undone' : (
                <button type="button" onClick={() => props.onUndo?.(entry.id)}>Undo</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
