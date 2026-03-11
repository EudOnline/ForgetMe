import type { ReviewEvidenceTrace } from '../../shared/archiveContracts'

export function ReviewEvidenceTraceCard(props: {
  trace: ReviewEvidenceTrace
}) {
  return (
    <section>
      <h2>Evidence Trace</h2>
      <dl>
        <dt>Source File</dt>
        <dd>{props.trace.sourceFile?.fileName ?? 'No source file'}</dd>
        <dt>Source Evidence</dt>
        <dd>{props.trace.sourceEvidence?.evidenceType ?? 'No source evidence'}</dd>
        <dt>Source Candidate</dt>
        <dd>{props.trace.sourceCandidate?.candidateType ?? 'No upstream candidate'}</dd>
        <dt>Source Journal</dt>
        <dd>{props.trace.sourceJournal?.decisionType ?? 'No source journal'}</dd>
      </dl>
    </section>
  )
}
