import { useEffect, useMemo, useState } from 'react'
import type { DocumentEvidence } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { LayoutBlockList } from '../components/LayoutBlockList'
import { OCRTextPanel } from '../components/OCRTextPanel'
import { StructuredFieldCandidateTable } from '../components/StructuredFieldCandidateTable'

export function DocumentEvidencePage(props: { fileId: string | null }) {
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
    return <p>Select a file to inspect document evidence.</p>
  }

  if (!evidence) {
    return <p>Loading evidence…</p>
  }

  return (
    <section>
      <h2>Document Evidence</h2>
      <p>{evidence.fileName}</p>
      <OCRTextPanel rawText={evidence.rawText} />
      <LayoutBlockList blocks={evidence.layoutBlocks} />

      <section>
        <h3>Approved Fields</h3>
        <ul>
          {evidence.approvedFields.map((field) => (
            <li key={`${field.fileId}-${field.fieldKey}-${field.value}`}>
              {field.fieldKey}: {field.value}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Field Candidates</h3>
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
