import type {
  ContextPackExportMode,
  GroupPortrait,
  GroupPortraitReplayShortcut,
  MemoryWorkspaceScope,
  PersonDossierReviewShortcut
} from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

function formatRatio(value: number) {
  return value.toFixed(2)
}

export function GroupPortraitView(props: {
  portrait: GroupPortrait | null
  contextPackMode?: ContextPackExportMode
  contextPackDestination?: string
  contextPackStatus?: string
  isExportingContextPack?: boolean
  onChangeContextPackMode?: (mode: ContextPackExportMode) => void
  onPickContextPackDestination?: () => void
  onExportContextPack?: () => void
  onOpenEvidenceFile?: (fileId: string) => void
  onOpenPerson?: (canonicalPersonId: string) => void
  onOpenReviewWorkbench?: (shortcut: PersonDossierReviewShortcut) => void
  onOpenReplayHistory?: (shortcut: GroupPortraitReplayShortcut) => void
  onOpenMemoryWorkspace?: (scope: MemoryWorkspaceScope) => void
}) {
  const { t } = useI18n()

  if (!props.portrait) {
    return <p>{t('groupPortrait.select')}</p>
  }

  const { portrait } = props

  return (
    <section>
      <h1>{t('groupPortrait.title')}</h1>
      <p>{portrait.title}</p>
      <button
        type="button"
        onClick={() => props.onOpenMemoryWorkspace?.({ kind: 'group', anchorPersonId: portrait.anchorPersonId })}
      >
        {t('groupPortrait.openMemoryWorkspace')}
      </button>

      <section aria-label={t('groupPortrait.contextPack.title')}>
        <h2>{t('groupPortrait.contextPack.title')}</h2>
        <label>
          {t('groupPortrait.contextPack.mode')}
          <select
            value={props.contextPackMode ?? 'approved_plus_derived'}
            onChange={(event) => props.onChangeContextPackMode?.(event.target.value as ContextPackExportMode)}
          >
            <option value="approved_plus_derived">{t('groupPortrait.contextPack.mode.approvedPlusDerived')}</option>
            <option value="approved_only">{t('groupPortrait.contextPack.mode.approvedOnly')}</option>
          </select>
        </label>
        <div>{props.contextPackDestination || t('groupPortrait.contextPack.noDestination')}</div>
        <div>
          <button
            type="button"
            onClick={() => props.onPickContextPackDestination?.()}
            disabled={props.isExportingContextPack}
          >
            {t('groupPortrait.contextPack.chooseDestination')}
          </button>
          <button
            type="button"
            onClick={() => props.onExportContextPack?.()}
            disabled={props.isExportingContextPack}
          >
            {t('groupPortrait.contextPack.export')}
          </button>
        </div>
        {props.contextPackStatus ? <p>{props.contextPackStatus}</p> : null}
      </section>

      <section aria-label={t('groupPortrait.members.title')}>
        <h2>{t('groupPortrait.members.title')}</h2>
        <ul>
          {portrait.members.map((member) => (
            <li key={member.personId}>
              {props.onOpenPerson ? (
                <button
                  type="button"
                  aria-label={`Open member ${member.displayName}`}
                  onClick={() => props.onOpenPerson?.(member.personId)}
                >
                  {member.displayName}
                </button>
              ) : (
                member.displayName
              )}
              {member.isAnchor ? ` · ${t('groupPortrait.members.anchor')}` : ''}
              {member.manualLabel ? ` · ${member.manualLabel}` : ''}
              {` · files ${member.sharedFileCount} · events ${member.sharedEventCount} · connections ${member.connectionCount}`}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={t('groupPortrait.relationshipDensity.title')}>
        <h2>{t('groupPortrait.relationshipDensity.title')}</h2>
        <p>{portrait.relationshipDensity.actualEdgeCount} / {portrait.relationshipDensity.possibleEdgeCount}</p>
        <p>{t('groupPortrait.relationshipDensity.ratio')}: {formatRatio(portrait.relationshipDensity.densityRatio)}</p>
      </section>

      <section aria-label={t('groupPortrait.sharedEvents.title')}>
        <h2>{t('groupPortrait.sharedEvents.title')}</h2>
        {portrait.sharedEvents.length ? (
          <ul>
            {portrait.sharedEvents.map((event) => (
              <li key={event.eventId}>
                {event.title} · {event.memberCount} members · {event.members.join(', ')}
                {event.evidenceRefs.length ? (
                  <>
                    {' · evidence '}
                    {event.evidenceRefs.map((ref) => (
                      ref.kind === 'file' && props.onOpenEvidenceFile ? (
                        <button
                          key={`${event.eventId}:${ref.kind}:${ref.id}`}
                          type="button"
                          aria-label={`Open event evidence ${ref.label}`}
                          onClick={() => props.onOpenEvidenceFile?.(ref.id)}
                        >
                          {ref.label}
                        </button>
                      ) : (
                        <span key={`${event.eventId}:${ref.kind}:${ref.id}`}>
                          {ref.label}
                        </span>
                      )
                    ))}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('groupPortrait.sharedEvents.none')}</p>
        )}
      </section>

      <section aria-label={t('groupPortrait.timelineWindows.title')}>
        <h2>{t('groupPortrait.timelineWindows.title')}</h2>
        {portrait.timelineWindows.length ? (
          <ul>
            {portrait.timelineWindows.map((window) => (
              <li key={window.windowId}>
                {window.title} · {window.timeStart} → {window.timeEnd}
                {` · ${window.eventCount} events · ${window.memberCount} members · ${window.members.join(', ')}`}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('groupPortrait.timelineWindows.none')}</p>
        )}
      </section>

      <section aria-label={t('groupPortrait.summary.title')}>
        <h2>{t('groupPortrait.summary.title')}</h2>
        <ul>
          {portrait.narrativeSummary.map((item) => (
            <li key={item.summaryId}>{item.text}</li>
          ))}
        </ul>
      </section>

      <section aria-label={t('groupPortrait.sharedEvidenceSources.title')}>
        <h2>{t('groupPortrait.sharedEvidenceSources.title')}</h2>
        {portrait.sharedEvidenceSources.length ? (
          <ul>
            {portrait.sharedEvidenceSources.map((source) => (
              <li key={source.fileId}>
                <button
                  type="button"
                  onClick={() => props.onOpenEvidenceFile?.(source.fileId)}
                  disabled={!props.onOpenEvidenceFile}
                >
                  {source.fileName}
                </button>
                {` · ${source.memberCount} members · ${source.members.join(', ')}`}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('groupPortrait.sharedEvidenceSources.none')}</p>
        )}
      </section>

      <section aria-label={t('groupPortrait.replayShortcuts.title')}>
        <h2>{t('groupPortrait.replayShortcuts.title')}</h2>
        {portrait.replayShortcuts.length ? (
          <ul>
            {portrait.replayShortcuts.map((shortcut) => (
              <li key={shortcut.journalId}>
                <button
                  type="button"
                  onClick={() => props.onOpenReplayHistory?.(shortcut)}
                  disabled={!props.onOpenReplayHistory}
                >
                  {shortcut.label}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('groupPortrait.replayShortcuts.none')}</p>
        )}
      </section>

      <section aria-label={t('groupPortrait.centralPeople.title')}>
        <h2>{t('groupPortrait.centralPeople.title')}</h2>
        <ul>
          {portrait.centralPeople.map((person) => (
            <li key={person.personId}>
              {person.displayName} · connections {person.connectionCount} · files {person.sharedFileCount} · events {person.sharedEventCount}
            </li>
        ))}
      </ul>
    </section>

      <section aria-label={t('groupPortrait.unresolvedAmbiguity.title')}>
        <h2>{t('groupPortrait.unresolvedAmbiguity.title')}</h2>
        <p>{t('groupPortrait.unresolvedAmbiguity.pendingReview')}: {portrait.ambiguitySummary.pendingReviewCount}</p>
        <p>{t('groupPortrait.unresolvedAmbiguity.conflictGroups')}: {portrait.ambiguitySummary.conflictGroupCount}</p>
        <p>{t('groupPortrait.unresolvedAmbiguity.affectedMembers')}: {portrait.ambiguitySummary.affectedMemberCount}</p>
        {portrait.ambiguitySummary.reviewShortcut && props.onOpenReviewWorkbench ? (
          <button
            type="button"
            onClick={() => props.onOpenReviewWorkbench?.(portrait.ambiguitySummary.reviewShortcut!)}
          >
            {portrait.ambiguitySummary.reviewShortcut.label}
          </button>
        ) : null}
      </section>
    </section>
  )
}
