import type { StructuredFieldCandidate } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

export function StructuredFieldCandidateTable(props: {
  candidates: StructuredFieldCandidate[]
  onApprove?: (queueItemId: string) => void | Promise<void>
  onReject?: (queueItemId: string) => void | Promise<void>
}) {
  const { t } = useI18n()

  if (props.candidates.length === 0) {
    return <p>{t('documentEvidence.structuredCandidates.none')}</p>
  }

  return (
    <table>
      <thead>
        <tr>
          <th>{t('documentEvidence.table.field')}</th>
          <th>{t('documentEvidence.table.value')}</th>
          <th>{t('documentEvidence.table.status')}</th>
          <th>{t('documentEvidence.table.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {props.candidates.map((candidate) => (
          <tr key={candidate.id}>
            <td>{candidate.fieldKey}</td>
            <td>{candidate.fieldValue}</td>
            <td>{candidate.status}</td>
            <td>
              <button type="button" disabled={!candidate.queueItemId} onClick={() => candidate.queueItemId && void props.onApprove?.(candidate.queueItemId)}>{t('documentEvidence.action.approve')}</button>
              <button type="button" disabled={!candidate.queueItemId} onClick={() => candidate.queueItemId && void props.onReject?.(candidate.queueItemId)}>{t('documentEvidence.action.reject')}</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
