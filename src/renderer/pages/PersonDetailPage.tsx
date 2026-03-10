import { useEffect, useMemo, useState } from 'react'
import type { CanonicalPersonDetail, PersonGraph, PersonTimelineEvent } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { PersonSummaryCard } from '../components/PersonSummaryCard'
import { PersonTimeline } from '../components/PersonTimeline'
import { RelationshipGraph } from '../components/RelationshipGraph'

export function PersonDetailPage(props: { canonicalPersonId: string | null }) {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [person, setPerson] = useState<CanonicalPersonDetail | null>(null)
  const [timeline, setTimeline] = useState<PersonTimelineEvent[]>([])
  const [graph, setGraph] = useState<PersonGraph>({ nodes: [], edges: [] })

  useEffect(() => {
    if (!props.canonicalPersonId) {
      setPerson(null)
      setTimeline([])
      setGraph({ nodes: [], edges: [] })
      return
    }

    void archiveApi.getCanonicalPerson(props.canonicalPersonId).then(setPerson)
    void archiveApi.getPersonTimeline(props.canonicalPersonId).then(setTimeline)
    void archiveApi.getPersonGraph(props.canonicalPersonId).then(setGraph)
  }, [archiveApi, props.canonicalPersonId])

  return (
    <section>
      <h1>Person Detail</h1>
      <PersonSummaryCard person={person} />
      <PersonTimeline events={timeline} />
      <RelationshipGraph graph={graph} />
    </section>
  )
}
