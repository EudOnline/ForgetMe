import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'
import { FileTable } from './FileTable'

function getBatchCounts(batch: ImportBatchSummary) {
  return {
    importedCount: batch.summary?.frozenCount ?? batch.files?.length ?? 0,
    parsedCount: batch.summary?.parsedCount ?? batch.files?.filter((file) => file.parserStatus === 'parsed').length ?? 0,
    duplicateCount:
      batch.summary?.duplicateCount ?? batch.files?.filter((file) => file.duplicateClass === 'duplicate_exact').length ?? 0,
    reviewCount: batch.summary?.reviewCount ?? 0
  }
}

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
          <section aria-label={t('batch.detail.summary.title')}>
            <h3>{t('batch.detail.summary.title')}</h3>
            <p>{t('batch.detail.summary.imported', { count: getBatchCounts(props.batch).importedCount })}</p>
            <p>{t('batch.detail.summary.parsed', { count: getBatchCounts(props.batch).parsedCount })}</p>
            <p>{t('batch.detail.summary.duplicates', { count: getBatchCounts(props.batch).duplicateCount })}</p>
            <p>{t('batch.detail.summary.reviewQueue', { count: getBatchCounts(props.batch).reviewCount })}</p>
          </section>
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
