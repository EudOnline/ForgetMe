import { useEffect, useMemo, useState } from 'react'
import type { EnrichmentJob } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { EnrichmentJobTable } from '../components/EnrichmentJobTable'

export function EnrichmentJobsPage(props?: { onSelectFile?: (fileId: string) => void }) {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [jobs, setJobs] = useState<EnrichmentJob[]>([])

  const refresh = async () => {
    setJobs(await archiveApi.listEnrichmentJobs())
  }

  useEffect(() => {
    void refresh()
  }, [archiveApi])

  return (
    <section>
      <h2>Enrichment Jobs</h2>
      <EnrichmentJobTable
        jobs={jobs}
        onInspectFile={props?.onSelectFile}
        onRerun={async (jobId) => {
          await archiveApi.rerunEnrichmentJob(jobId)
          await refresh()
        }}
      />
    </section>
  )
}
