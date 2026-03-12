export function ReviewContinuousNavigationBar(props: {
  currentIndex: number
  totalCount: number
  canGoPrevious: boolean
  canGoNext: boolean
  onPrevious?: () => void | Promise<void>
  onNext?: () => void | Promise<void>
}) {
  return (
    <section>
      <h2>Continuous Navigation</h2>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void props.onPrevious?.()} disabled={!props.canGoPrevious}>
          Previous
        </button>
        <span>{props.currentIndex} / {props.totalCount}</span>
        <button type="button" onClick={() => void props.onNext?.()} disabled={!props.canGoNext}>
          Next
        </button>
        <span>j / k</span>
      </div>
    </section>
  )
}
