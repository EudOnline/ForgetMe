import type { ReviewWorkbenchDetail } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

export function ReviewCandidateSummaryCard(props: {
  detail: ReviewWorkbenchDetail
}) {
  const { t } = useI18n()
  const { item, candidate, queueItem } = props.detail

  return (
    <section>
      <h2>{t('reviewWorkbench.candidate.title')}</h2>
      <dl>
        <dt>{t('reviewWorkbench.candidate.type')}</dt>
        <dd>{item.itemType}</dd>
        <dt>{t('reviewWorkbench.candidate.field')}</dt>
        <dd>{item.fieldKey ?? t('common.unknown')}</dd>
        <dt>{t('reviewWorkbench.candidate.value')}</dt>
        <dd>{item.displayValue || t('common.unknown')}</dd>
        <dt>{t('reviewWorkbench.candidate.person')}</dt>
        <dd>{item.canonicalPersonName ?? t('personDossier.unassignedPerson')}</dd>
        <dt>{t('reviewWorkbench.candidate.status')}</dt>
        <dd>{queueItem.status}</dd>
        <dt>{t('reviewWorkbench.candidate.confidence')}</dt>
        <dd>{queueItem.confidence}</dd>
      </dl>
      {candidate ? <pre>{JSON.stringify(candidate, null, 2)}</pre> : <p>{t('reviewWorkbench.candidate.noPayload')}</p>}
    </section>
  )
}
