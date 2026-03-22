import type { ReviewEvidenceTrace } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

export function ReviewEvidenceTraceCard(props: {
  trace: ReviewEvidenceTrace
}) {
  const { t } = useI18n()

  return (
    <section>
      <h2>{t('reviewWorkbench.trace.title')}</h2>
      <dl>
        <dt>{t('reviewWorkbench.trace.sourceFile')}</dt>
        <dd>{props.trace.sourceFile?.fileName ?? t('reviewWorkbench.trace.noSourceFile')}</dd>
        <dt>{t('reviewWorkbench.trace.sourceEvidence')}</dt>
        <dd>{props.trace.sourceEvidence?.evidenceType ?? t('reviewWorkbench.trace.noSourceEvidence')}</dd>
        <dt>{t('reviewWorkbench.trace.sourceCandidate')}</dt>
        <dd>{props.trace.sourceCandidate?.candidateType ?? t('reviewWorkbench.trace.noUpstreamCandidate')}</dd>
        <dt>{t('reviewWorkbench.trace.sourceJournal')}</dt>
        <dd>{props.trace.sourceJournal?.decisionType ?? t('reviewWorkbench.trace.noSourceJournal')}</dd>
      </dl>
    </section>
  )
}
