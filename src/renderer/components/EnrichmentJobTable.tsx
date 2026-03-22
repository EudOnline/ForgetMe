import type { EnrichmentJob } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

export function EnrichmentJobTable(props: {
  jobs: EnrichmentJob[]
  onRerun?: (jobId: string) => void | Promise<void>
  onInspectFile?: (fileId: string) => void
  onInspectBoundary?: (jobId: string) => void | Promise<void>
}) {
  const { t } = useI18n()

  if (props.jobs.length === 0) {
    return <p>{t('enrichmentJobs.none')}</p>
  }

  return (
    <table>
      <thead>
        <tr>
          <th>{t('enrichmentJobs.table.type')}</th>
          <th>{t('enrichmentJobs.table.file')}</th>
          <th>{t('enrichmentJobs.table.status')}</th>
          <th>{t('enrichmentJobs.table.attempts')}</th>
          <th>{t('enrichmentJobs.table.lastError')}</th>
          <th>{t('enrichmentJobs.table.provider')}</th>
          <th>{t('enrichmentJobs.table.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {props.jobs.map((job) => (
          <tr key={job.id}>
            <td>{job.enhancerType}</td>
            <td>{job.fileName}</td>
            <td>{job.status}</td>
            <td>{job.attemptCount}</td>
            <td>{job.errorMessage ?? '—'}</td>
            <td>{job.provider}</td>
            <td>
              <button type="button" onClick={() => void props.onRerun?.(job.id)}>{t('enrichmentJobs.action.rerun')}</button>
              <button type="button" onClick={() => props.onInspectFile?.(job.fileId)}>{t('enrichmentJobs.action.inspect')}</button>
              <button type="button" onClick={() => void props.onInspectBoundary?.(job.id)}>{t('enrichmentJobs.action.boundary')}</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
