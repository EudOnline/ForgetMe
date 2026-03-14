import { useEffect, useMemo, useState } from 'react'
import type {
  ContextPackExportMode,
  GroupPortraitBrowseSummary,
  GroupPortrait,
  GroupPortraitReplayShortcut,
  MemoryWorkspaceScope,
  PersonDossierReviewShortcut
} from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { GroupPortraitView } from '../components/GroupPortraitView'

export function GroupPortraitPage(props: {
  canonicalPersonId: string | null
  onOpenGroupPortrait?: (canonicalPersonId: string) => void
  onOpenEvidenceFile?: (fileId: string) => void
  onOpenPerson?: (canonicalPersonId: string) => void
  onOpenReviewWorkbench?: (shortcut: PersonDossierReviewShortcut) => void
  onOpenReplayHistory?: (shortcut: GroupPortraitReplayShortcut) => void
  onOpenMemoryWorkspace?: (scope: MemoryWorkspaceScope) => void
}) {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [portrait, setPortrait] = useState<GroupPortrait | null>(null)
  const [browseSummaries, setBrowseSummaries] = useState<GroupPortraitBrowseSummary[]>([])
  const [contextPackMode, setContextPackMode] = useState<ContextPackExportMode>('approved_plus_derived')
  const [contextPackDestination, setContextPackDestination] = useState('')
  const [contextPackStatus, setContextPackStatus] = useState('')
  const [isExportingContextPack, setIsExportingContextPack] = useState(false)

  useEffect(() => {
    if (!props.canonicalPersonId) {
      setPortrait(null)
      setContextPackStatus('')
      void archiveApi.listGroupPortraits().then(setBrowseSummaries)
      return
    }

    setBrowseSummaries([])
    void archiveApi.getGroupPortrait(props.canonicalPersonId).then(setPortrait)
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
      const result = await archiveApi.exportGroupContextPack({
        anchorPersonId: props.canonicalPersonId,
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

  if (!props.canonicalPersonId) {
    return (
      <section>
        <h1>Group Portraits</h1>
        {browseSummaries.length ? (
          <ul>
            {browseSummaries.map((summary) => (
              <li key={summary.anchorPersonId}>
                <h2>{summary.title}</h2>
                <p>
                  {summary.memberCount} members · {summary.sharedEventCount} shared events · {summary.sharedEvidenceSourceCount} shared sources
                </p>
                <p>Members: {summary.membersPreview.join(', ')}</p>
                <button
                  type="button"
                  aria-label={`Open ${summary.title}`}
                  onClick={() => props.onOpenGroupPortrait?.(summary.anchorPersonId)}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No multi-person group portraits discovered yet.</p>
        )}
      </section>
    )
  }

  return (
    <GroupPortraitView
      portrait={portrait}
      contextPackMode={contextPackMode}
      contextPackDestination={contextPackDestination}
      contextPackStatus={contextPackStatus}
      isExportingContextPack={isExportingContextPack}
      onChangeContextPackMode={setContextPackMode}
      onPickContextPackDestination={() => void handlePickContextPackDestination()}
      onExportContextPack={() => void handleExportContextPack()}
      onOpenPerson={props.onOpenPerson}
      onOpenEvidenceFile={props.onOpenEvidenceFile}
      onOpenReviewWorkbench={props.onOpenReviewWorkbench}
      onOpenReplayHistory={props.onOpenReplayHistory}
      onOpenMemoryWorkspace={props.onOpenMemoryWorkspace}
    />
  )
}
