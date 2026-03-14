import { useEffect, useMemo, useState } from 'react'
import type {
  ContextPackExportMode,
  MemoryWorkspaceScope,
  PersonDossier,
  PersonDossierReviewShortcut
} from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { PersonDossierView } from '../components/PersonDossierView'

export function PersonDetailPage(props: {
  canonicalPersonId: string | null
  onOpenEvidenceFile?: (fileId: string) => void
  onOpenReviewWorkbench?: (shortcut: PersonDossierReviewShortcut) => void
  onOpenGroupPortrait?: (canonicalPersonId: string) => void
  onOpenMemoryWorkspace?: (scope: MemoryWorkspaceScope) => void
}) {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [dossier, setDossier] = useState<PersonDossier | null>(null)
  const [contextPackMode, setContextPackMode] = useState<ContextPackExportMode>('approved_plus_derived')
  const [contextPackDestination, setContextPackDestination] = useState('')
  const [contextPackStatus, setContextPackStatus] = useState('')
  const [isExportingContextPack, setIsExportingContextPack] = useState(false)

  useEffect(() => {
    if (!props.canonicalPersonId) {
      setDossier(null)
      setContextPackStatus('')
      return
    }

    void archiveApi.getPersonDossier(props.canonicalPersonId).then(setDossier)
    setContextPackStatus('')
  }, [archiveApi, props.canonicalPersonId])

  const handlePickContextPackDestination = async () => {
    const selected = await archiveApi.selectContextPackExportDestination()
    if (selected) {
      setContextPackDestination(selected)
    }
  }

  const handleExportContextPack = async () => {
    if (!props.canonicalPersonId) {
      return
    }

    setIsExportingContextPack(true)
    setContextPackStatus('')

    const destinationRoot = contextPackDestination || await archiveApi.selectContextPackExportDestination()
    if (!destinationRoot) {
      setIsExportingContextPack(false)
      return
    }

    setContextPackDestination(destinationRoot)

    try {
      const result = await archiveApi.exportPersonContextPack({
        canonicalPersonId: props.canonicalPersonId,
        destinationRoot,
        mode: contextPackMode
      })

      if (result) {
        setContextPackStatus(`Exported ${result.fileName}`)
      }
    } catch (error) {
      setContextPackStatus(error instanceof Error ? error.message : 'Context pack export failed')
    }

    setIsExportingContextPack(false)
  }

  return (
    <PersonDossierView
      dossier={dossier}
      contextPackMode={contextPackMode}
      contextPackDestination={contextPackDestination}
      contextPackStatus={contextPackStatus}
      isExportingContextPack={isExportingContextPack}
      onChangeContextPackMode={setContextPackMode}
      onPickContextPackDestination={() => void handlePickContextPackDestination()}
      onExportContextPack={() => void handleExportContextPack()}
      onOpenEvidenceFile={props.onOpenEvidenceFile}
      onOpenReviewWorkbench={props.onOpenReviewWorkbench}
      onOpenGroupPortrait={props.onOpenGroupPortrait}
      onOpenMemoryWorkspace={props.onOpenMemoryWorkspace}
    />
  )
}
