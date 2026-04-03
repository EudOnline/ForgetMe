import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DocumentEvidence } from '../../shared/archiveContracts'
import { getOpsClient } from '../clients/opsClient'
import { useI18n } from '../i18n'
import { LayoutBlockList } from '../components/LayoutBlockList'
import { OCRTextPanel } from '../components/OCRTextPanel'
import { StructuredFieldCandidateTable } from '../components/StructuredFieldCandidateTable'

export function DocumentEvidencePage(props: { fileId: string | null }) {
  const { t } = useI18n()
  const opsClient = useMemo(() => getOpsClient(), [])
  const [evidence, setEvidence] = useState<DocumentEvidence | null>(null)
  const { fileId } = props

  const refresh = useCallback(async () => {
    if (!fileId) {
      setEvidence(null)
      return
    }

    setEvidence(await opsClient.getDocumentEvidence(fileId))
  }, [opsClient, fileId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!fileId) {
    return <p>{t('documentEvidence.selectFile')}</p>
  }

  if (!evidence) {
    return <p>{t('documentEvidence.loading')}</p>
  }

  return (
    <section>
      <h2>{t('documentEvidence.title')}</h2>
      <p>{evidence.fileName}</p>
      <OCRTextPanel rawText={evidence.rawText} />
      <LayoutBlockList blocks={evidence.layoutBlocks} />

      <section>
        <h3>{t('documentEvidence.approvedFields')}</h3>
        <ul>
          {evidence.approvedFields.map((field) => (
            <li key={`${field.fileId}-${field.fieldKey}-${field.value}`}>
              {field.fieldKey}: {field.value}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>{t('documentEvidence.fieldCandidates')}</h3>
        <StructuredFieldCandidateTable
          candidates={evidence.fieldCandidates}
          onApprove={async (queueItemId) => {
            await opsClient.approveStructuredFieldCandidate(queueItemId)
            await refresh()
          }}
          onReject={async (queueItemId) => {
            await opsClient.rejectStructuredFieldCandidate({ queueItemId })
            await refresh()
          }}
        />
      </section>
    </section>
  )
}
