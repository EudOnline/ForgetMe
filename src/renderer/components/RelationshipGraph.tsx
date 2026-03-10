import type { PersonGraph } from '../../shared/archiveContracts'

export function RelationshipGraph(props: { graph: PersonGraph }) {
  if (props.graph.nodes.length === 0) {
    return <p>No approved graph edges yet.</p>
  }

  return (
    <section>
      <h3>Graph</h3>
      <p>Nodes: {props.graph.nodes.map((node) => node.primaryDisplayName).join(', ')}</p>
      <ul>
        {props.graph.edges.map((edge) => (
          <li key={`${edge.fromPersonId}-${edge.toPersonId}`}>
            {edge.fromPersonId} → {edge.toPersonId} · shared files {edge.sharedFileCount}{edge.manualLabel ? ` · ${edge.manualLabel}` : ''}
          </li>
        ))}
      </ul>
    </section>
  )
}
