import type { CanonicalPersonDetail } from '../../shared/archiveContracts'

export function PersonSummaryCard(props: { person: CanonicalPersonDetail | null }) {
  if (!props.person) {
    return <p>Select a person to inspect the approved profile.</p>
  }

  return (
    <section>
      <h2>{props.person.primaryDisplayName}</h2>
      <p>Evidence anchors: {props.person.evidenceCount}</p>
      <p>Aliases: {props.person.aliases.map((alias) => alias.displayName).join(', ') || 'None'}</p>
      <h3>Approved Fields</h3>
      {props.person.approvedFields?.length ? (
        <ul>
          {props.person.approvedFields.map((field) => (
            <li key={`${field.fileId}-${field.fieldKey}-${field.value}`}>
              {field.fieldKey}: {field.value}
            </li>
          ))}
        </ul>
      ) : (
        <p>No approved enriched fields yet.</p>
      )}
    </section>
  )
}
