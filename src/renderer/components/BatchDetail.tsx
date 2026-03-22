import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'
import { FileTable } from './FileTable'

export function BatchDetail(props: { batch: ImportBatchSummary | null }) {
  const { t } = useI18n()

  return (
    <section>
      <h2>{t('batch.detail.title')}</h2>
      {props.batch ? <p>{props.batch.sourceLabel}</p> : <p>{t('batch.detail.select')}</p>}
      <FileTable batch={props.batch} />
    </section>
  )
}
