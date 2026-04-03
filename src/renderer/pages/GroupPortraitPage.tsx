import { useEffect, useMemo, useState } from 'react'
import type {
  ContextPackExportMode,
  GroupPortraitBrowseSummary,
  GroupPortrait,
  GroupPortraitReplayShortcut,
  MemoryWorkspaceScope,
  PersonDossierReviewShortcut
} from '../../shared/archiveContracts'
import { getPeopleClient } from '../clients/peopleClient'
import { useI18n } from '../i18n'
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
  const { t } = useI18n()
  const peopleClient = useMemo(() => getPeopleClient(), [])
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
      void peopleClient.listGroupPortraits().then(setBrowseSummaries)
      return
    }

    setBrowseSummaries([])
    void peopleClient.getGroupPortrait(props.canonicalPersonId).then(setPortrait)
    setContextPackStatus('')
  }, [peopleClient, props.canonicalPersonId])

  const handlePickContextPackDestination = async () => {
    const selected = await peopleClient.selectContextPackExportDestination()
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

    const destinationRoot = contextPackDestination || await peopleClient.selectContextPackExportDestination()
    if (!destinationRoot) {
      setIsExportingContextPack(false)
      return
    }

    setContextPackDestination(destinationRoot)

    try {
      const result = await peopleClient.exportGroupContextPack({
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
        <h1>{t('groupPortrait.browse.title')}</h1>
        {browseSummaries.length ? (
          <ul>
            {browseSummaries.map((summary) => (
              <li key={summary.anchorPersonId}>
                <h2>{summary.title}</h2>
                <p>
                  {t('groupPortrait.browse.stats', {
                    members: summary.memberCount,
                    events: summary.sharedEventCount,
                    sources: summary.sharedEvidenceSourceCount
                  })}
                </p>
                <p>{t('groupPortrait.browse.members')}: {summary.membersPreview.join(', ')}</p>
                <button
                  type="button"
                  aria-label={`${t('groupPortrait.browse.open')} ${summary.title}`}
                  onClick={() => props.onOpenGroupPortrait?.(summary.anchorPersonId)}
                >
                  {t('groupPortrait.browse.open')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('groupPortrait.browse.none')}</p>
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
