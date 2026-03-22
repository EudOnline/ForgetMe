import { useEffect, useMemo, useState } from 'react'
import type { EnrichmentJob, ProviderEgressArtifact } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { useI18n } from '../i18n'
import { EnrichmentJobTable } from '../components/EnrichmentJobTable'

export function EnrichmentJobsPage(props?: { onSelectFile?: (fileId: string) => void }) {
  const { t } = useI18n()
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [jobs, setJobs] = useState<EnrichmentJob[]>([])
  const [selectedBoundaryJobId, setSelectedBoundaryJobId] = useState<string | null>(null)
  const [selectedBoundaryArtifacts, setSelectedBoundaryArtifacts] = useState<ProviderEgressArtifact[]>([])

  const refresh = async () => {
    setJobs(await archiveApi.listEnrichmentJobs())
  }

  useEffect(() => {
    void refresh()
    const timer = globalThis.setInterval(() => {
      void refresh()
    }, 2_000)

    return () => globalThis.clearInterval(timer)
  }, [archiveApi])

  const handleInspectBoundary = async (jobId: string) => {
    setSelectedBoundaryJobId(jobId)
    setSelectedBoundaryArtifacts(await archiveApi.listProviderEgressArtifacts(jobId))
  }

  const firstArtifact = selectedBoundaryArtifacts[0] ?? null
  const requestEvent = firstArtifact?.events.find((event) => event.eventType === 'request') ?? null
  const requestFileRef = typeof requestEvent?.payload.fileRef === 'string' ? requestEvent.payload.fileRef : null

  return (
    <section>
      <h2>{t('enrichmentJobs.title')}</h2>
      <EnrichmentJobTable
        jobs={jobs}
        onInspectFile={props?.onSelectFile}
        onInspectBoundary={handleInspectBoundary}
        onRerun={async (jobId) => {
          await archiveApi.rerunEnrichmentJob(jobId)
          await refresh()
        }}
      />

      {selectedBoundaryJobId ? (
        <section>
          <h3>{t('enrichmentJobs.boundaryAudit.title')}</h3>
          {firstArtifact ? (
            <>
              <p>{firstArtifact.policyKey}</p>
              <p>{firstArtifact.fileName}</p>
              <p>{JSON.stringify(firstArtifact.redactionSummary)}</p>
              {requestFileRef ? <p>{requestFileRef}</p> : null}
              <pre>{JSON.stringify(requestEvent?.payload ?? {}, null, 2)}</pre>
            </>
          ) : (
            <p>{t('enrichmentJobs.boundaryAudit.none')}</p>
          )}
        </section>
      ) : null}
    </section>
  )
}
