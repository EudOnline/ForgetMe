import { useEffect, useMemo, useState } from 'react'
import type { DocumentEvidence } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { useI18n } from '../i18n'
import { LayoutBlockList } from '../components/LayoutBlockList'
import { OCRTextPanel } from '../components/OCRTextPanel'
import { StructuredFieldCandidateTable } from '../components/StructuredFieldCandidateTable'

export function DocumentEvidencePage(props: { fileId: string | null }) {
  const { t } = useI18n()
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [evidence, setEvidence] = useState<DocumentEvidence | null>(null)

  const refresh = async () => {
    if (!props.fileId) {
      setEvidence(null)
      return
    }

    setEvidence(await archiveApi.getDocumentEvidence(props.fileId))
  }

  useEffect(() => {
    void refresh()
  }, [archiveApi, props.fileId])

  if (!props.fileId) {
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
            await archiveApi.approveStructuredFieldCandidate(queueItemId)
            await refresh()
          }}
          onReject={async (queueItemId) => {
            await archiveApi.rejectStructuredFieldCandidate({ queueItemId })
            await refresh()
          }}
        />
      </section>
    </section>
  )
}
