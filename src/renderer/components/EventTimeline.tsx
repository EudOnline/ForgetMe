import type { PersonTimelineEvent } from '../../shared/archiveContracts'
import { EvidenceTimeline } from './EvidenceTimeline'

export function EventTimeline(props: { events: PersonTimelineEvent[] }) {
  if (props.events.length === 0) {
    return <p>No approved events yet.</p>
  }

  return (
    <div>
      {props.events.map((event) => (
        <article key={event.eventId}>
          <h4>{event.title}</h4>
          <p>{event.timeStart} → {event.timeEnd}</p>
          <EvidenceTimeline evidence={event.evidence} />
        </article>
      ))}
    </div>
  )
}
