import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'
import { FileTable } from './FileTable'

export function BatchDetail(props: { batch: ImportBatchSummary | null }) {
  const { t } = useI18n()
  const duplicateFiles = props.batch?.files?.filter((file) => file.duplicateClass === 'duplicate_exact') ?? []
  const skippedFiles = props.batch?.files?.filter((file) => file.parserStatus !== 'parsed') ?? []

  return (
    <section>
      <h2>{t('batch.detail.title')}</h2>
      {props.batch ? (
        <>
          <p>{props.batch.sourceLabel}</p>
          {duplicateFiles.length > 0 || skippedFiles.length > 0 ? (
            <section aria-label={t('batch.detail.status.title')}>
              {duplicateFiles.length > 0 ? (
                <p>
                  <strong>{t('batch.detail.status.duplicates')}</strong>
                  {': '}
                  {duplicateFiles.map((file) => file.fileName).join(', ')}
                </p>
              ) : null}
              {skippedFiles.length > 0 ? (
                <p>
                  <strong>{t('batch.detail.status.skipped')}</strong>
                  {': '}
                  {skippedFiles.map((file) => file.fileName).join(', ')}
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      ) : <p>{t('batch.detail.select')}</p>}
      <FileTable batch={props.batch} />
    </section>
  )
}
