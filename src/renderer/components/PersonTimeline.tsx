import type { PersonTimelineEvent } from '../../shared/archiveContracts'
import { EventTimeline } from './EventTimeline'

export function PersonTimeline(props: { events: PersonTimelineEvent[] }) {
  return (
    <section>
      <h3>Timeline</h3>
      <EventTimeline events={props.events} />
    </section>
  )
}
