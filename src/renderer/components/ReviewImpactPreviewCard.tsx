import type { ReviewImpactPreview } from '../../shared/archiveContracts'

function ImpactSection(props: {
  title: string
  impact: {
    kind: string
    summary: string
    canonicalPersonId: string | null
  }
}) {
  return (
    <section>
      <h3>{props.title}</h3>
      <dl>
        <dt>Kind</dt>
        <dd>{props.impact.kind}</dd>
        <dt>Summary</dt>
        <dd>{props.impact.summary}</dd>
        <dt>Person</dt>
        <dd>{props.impact.canonicalPersonId ?? 'No resolved person'}</dd>
      </dl>
    </section>
  )
}

export function ReviewImpactPreviewCard(props: {
  preview: ReviewImpactPreview
}) {
  return (
    <section>
      <h2>Impact Preview</h2>
      <ImpactSection title="Approve" impact={props.preview.approveImpact} />
      <ImpactSection title="Reject" impact={props.preview.rejectImpact} />
      <ImpactSection title="Undo" impact={props.preview.undoImpact} />
    </section>
  )
}
