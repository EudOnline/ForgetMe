import type { CanonicalPersonDetail } from '../../shared/archiveContracts'

function titleCase(input: string) {
  return input
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function PersonSummaryCard(props: { person: CanonicalPersonDetail | null }) {
  if (!props.person) {
    return <p>Select a person to inspect the approved profile.</p>
  }

  const approvedProfileEntries = Object.entries(props.person.approvedProfile ?? {})

  return (
    <section>
      <h2>{props.person.primaryDisplayName}</h2>
      <p>Evidence anchors: {props.person.evidenceCount}</p>
      <p>Aliases: {props.person.aliases.map((alias) => alias.displayName).join(', ') || 'None'}</p>
      <h3>Approved Profile</h3>
      {approvedProfileEntries.length ? (
        approvedProfileEntries.map(([group, attributes]) => (
          <section key={group}>
            <h4>{titleCase(group)}</h4>
            <ul>
              {attributes.map((attribute) => (
                <li key={attribute.id}>
                  {attribute.attributeKey}: {attribute.displayValue}
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p>No formal approved profile yet.</p>
      )}
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
