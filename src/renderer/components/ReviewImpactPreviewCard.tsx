import type { ReviewImpactPreview } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

function ImpactSection(props: {
  title: string
  impact: {
    kind: string
    summary: string
    canonicalPersonId: string | null
  }
}) {
  const { t } = useI18n()

  return (
    <section>
      <h3>{props.title}</h3>
      <dl>
        <dt>{t('reviewWorkbench.impact.kind')}</dt>
        <dd>{props.impact.kind}</dd>
        <dt>{t('reviewWorkbench.impact.summary')}</dt>
        <dd>{props.impact.summary}</dd>
        <dt>{t('reviewWorkbench.impact.person')}</dt>
        <dd>{props.impact.canonicalPersonId ?? t('reviewWorkbench.impact.noPerson')}</dd>
      </dl>
    </section>
  )
}

export function ReviewImpactPreviewCard(props: {
  preview: ReviewImpactPreview
}) {
  const { t } = useI18n()

  return (
    <section>
      <h2>{t('reviewWorkbench.impact.title')}</h2>
      <ImpactSection title={t('reviewWorkbench.impact.approve')} impact={props.preview.approveImpact} />
      <ImpactSection title={t('reviewWorkbench.impact.reject')} impact={props.preview.rejectImpact} />
      <ImpactSection title={t('reviewWorkbench.impact.undo')} impact={props.preview.undoImpact} />
    </section>
  )
}
