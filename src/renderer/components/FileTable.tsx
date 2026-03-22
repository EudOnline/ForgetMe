import type { ImportBatchSummary } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

export function FileTable(props: { batch: ImportBatchSummary | null }) {
  const { t } = useI18n()

  if (!props.batch?.files?.length) {
    return <p>{t('fileTable.noFiles')}</p>
  }

  return (
    <table>
      <thead>
        <tr>
          <th>{t('fileTable.header.file')}</th>
          <th>{t('fileTable.header.duplicate')}</th>
          <th>{t('fileTable.header.parser')}</th>
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
