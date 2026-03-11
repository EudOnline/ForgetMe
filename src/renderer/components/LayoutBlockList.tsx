export function LayoutBlockList(props: {
  blocks: Array<{
    page: number
    text: string
    bbox?: number[]
  }>
}) {
  return (
    <section>
      <h3>Layout Blocks</h3>
      {props.blocks.length === 0 ? <p>No layout blocks available.</p> : null}
      <ul>
        {props.blocks.map((block, index) => (
          <li key={`${block.page}-${index}`}>
            Page {block.page}: {block.text}
          </li>
        ))}
      </ul>
    </section>
  )
}
