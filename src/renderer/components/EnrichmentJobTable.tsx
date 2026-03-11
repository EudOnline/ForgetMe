import type { EnrichmentJob } from '../../shared/archiveContracts'

export function EnrichmentJobTable(props: {
  jobs: EnrichmentJob[]
  onRerun?: (jobId: string) => void | Promise<void>
  onInspectFile?: (fileId: string) => void
}) {
  if (props.jobs.length === 0) {
    return <p>No enrichment jobs yet.</p>
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>File</th>
          <th>Status</th>
          <th>Provider</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {props.jobs.map((job) => (
          <tr key={job.id}>
            <td>{job.enhancerType}</td>
            <td>{job.fileName}</td>
            <td>{job.status}</td>
            <td>{job.provider}</td>
            <td>
              <button type="button" onClick={() => void props.onRerun?.(job.id)}>Rerun</button>
              <button type="button" onClick={() => props.onInspectFile?.(job.fileId)}>Inspect</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
