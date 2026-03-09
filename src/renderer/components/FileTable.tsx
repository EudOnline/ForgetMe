import type { ImportBatchSummary } from '../../shared/archiveContracts'

export function FileTable(props: { batch: ImportBatchSummary | null }) {
  if (!props.batch?.files?.length) {
    return <p>No files in this batch.</p>
  }

  return (
    <table>
      <thead>
        <tr>
          <th>File</th>
          <th>Duplicate</th>
          <th>Parser</th>
        </tr>
      </thead>
      <tbody>
        {props.batch.files.map((file) => (
          <tr key={file.fileId}>
            <td>{file.fileName}</td>
            <td>{file.duplicateClass}</td>
            <td>{file.parserStatus}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
