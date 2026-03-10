import type { PersonTimelineEvent } from '../../shared/archiveContracts'

export function EvidenceTimeline(props: { evidence: PersonTimelineEvent['evidence'] }) {
  if (props.evidence.length === 0) {
    return <p>No evidence points.</p>
  }

  return (
    <ul>
      {props.evidence.map((item) => (
        <li key={item.fileId}>{item.fileName}</li>
      ))}
    </ul>
  )
}
