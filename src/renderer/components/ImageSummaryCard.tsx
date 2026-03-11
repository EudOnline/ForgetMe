export function ImageSummaryCard(props: { summary: string | null | undefined }) {
  if (!props.summary) {
    return null
  }

  return (
    <section>
      <h3>Image Summary</h3>
      <p>{props.summary}</p>
    </section>
  )
}
