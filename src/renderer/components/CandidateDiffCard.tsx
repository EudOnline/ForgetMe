import type { ReviewQueueItem } from '../../shared/archiveContracts'

export function CandidateDiffCard(props: { item: ReviewQueueItem }) {
  return (
    <article>
      <strong>Impact preview</strong>
      <pre>{JSON.stringify(props.item.summary, null, 2)}</pre>
    </article>
  )
}
