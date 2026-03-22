import { useI18n } from '../i18n'

export type ReviewConflictCompareValueCount = {
  value: string
  count: number
}

export function ReviewConflictCompareCard(props: {
  fieldKey: string | null
  pendingCount: number
  distinctValuesWithCounts: ReviewConflictCompareValueCount[]
  hasConflict: boolean
}) {
  const { t } = useI18n()

  return (
    <section>
      <h2>{t('reviewWorkbench.compare.title')}</h2>
      <dl>
        <dt>{t('reviewWorkbench.compare.field')}</dt>
        <dd>{props.fieldKey ?? t('reviewWorkbench.compare.unknownField')}</dd>
        <dt>{t('reviewWorkbench.compare.status')}</dt>
        <dd>{props.hasConflict ? t('reviewWorkbench.compare.conflict') : t('reviewWorkbench.compare.aligned')}</dd>
        <dt>{t('reviewWorkbench.compare.pending')}</dt>
        <dd>{props.pendingCount}</dd>
        <dt>{t('reviewWorkbench.compare.distinctValues')}</dt>
        <dd>{t('reviewWorkbench.compare.valuesCount', { count: props.distinctValuesWithCounts.length })}</dd>
      </dl>
      <ul>
        {props.distinctValuesWithCounts.map((entry) => (
          <li key={entry.value}>
            {entry.value} · {entry.count}
          </li>
        ))}
      </ul>
    </section>
  )
}
