import type {
  ContextPackExportMode,
  GroupPortrait,
  GroupPortraitReplayShortcut,
  MemoryWorkspaceScope,
  PersonDossierReviewShortcut
} from '../../shared/archiveContracts'

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
  if (!props.portrait) {
    return <p>Select a person to open the group portrait.</p>
  }

  const { portrait } = props

  return (
    <section>
      <h1>Group Portrait</h1>
      <p>{portrait.title}</p>
      <button
        type="button"
        onClick={() => props.onOpenMemoryWorkspace?.({ kind: 'group', anchorPersonId: portrait.anchorPersonId })}
      >
        Open memory workspace
      </button>

      <section aria-label="Context Pack Export">
        <h2>Context Pack Export</h2>
        <label>
          Context pack mode
          <select
            value={props.contextPackMode ?? 'approved_plus_derived'}
            onChange={(event) => props.onChangeContextPackMode?.(event.target.value as ContextPackExportMode)}
          >
            <option value="approved_plus_derived">Approved + derived</option>
            <option value="approved_only">Approved only</option>
          </select>
        </label>
        <div>{props.contextPackDestination || 'No context pack destination selected.'}</div>
        <div>
          <button
            type="button"
            onClick={() => props.onPickContextPackDestination?.()}
            disabled={props.isExportingContextPack}
          >
            Choose context pack destination
          </button>
          <button
            type="button"
            onClick={() => props.onExportContextPack?.()}
            disabled={props.isExportingContextPack}
          >
            Export context pack
          </button>
        </div>
        {props.contextPackStatus ? <p>{props.contextPackStatus}</p> : null}
      </section>

      <section aria-label="Members">
        <h2>Members</h2>
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
              {member.isAnchor ? ' · anchor' : ''}
              {member.manualLabel ? ` · ${member.manualLabel}` : ''}
              {` · files ${member.sharedFileCount} · events ${member.sharedEventCount} · connections ${member.connectionCount}`}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Relationship Density">
        <h2>Relationship Density</h2>
        <p>{portrait.relationshipDensity.actualEdgeCount} / {portrait.relationshipDensity.possibleEdgeCount}</p>
        <p>Ratio: {formatRatio(portrait.relationshipDensity.densityRatio)}</p>
      </section>

      <section aria-label="Shared Events">
        <h2>Shared Events</h2>
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
          <p>No shared events yet.</p>
        )}
      </section>

      <section aria-label="Timeline Windows">
        <h2>Timeline Windows</h2>
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
          <p>No timeline windows yet.</p>
        )}
      </section>

      <section aria-label="Summary">
        <h2>Summary</h2>
        <ul>
          {portrait.narrativeSummary.map((item) => (
            <li key={item.summaryId}>{item.text}</li>
          ))}
        </ul>
      </section>

      <section aria-label="Shared Evidence Sources">
        <h2>Shared Evidence Sources</h2>
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
          <p>No shared evidence sources yet.</p>
        )}
      </section>

      <section aria-label="Replay Shortcuts">
        <h2>Replay Shortcuts</h2>
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
          <p>No replay shortcuts yet.</p>
        )}
      </section>

      <section aria-label="Central People">
        <h2>Central People</h2>
        <ul>
          {portrait.centralPeople.map((person) => (
            <li key={person.personId}>
              {person.displayName} · connections {person.connectionCount} · files {person.sharedFileCount} · events {person.sharedEventCount}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Unresolved Ambiguity">
        <h2>Unresolved Ambiguity</h2>
        <p>Pending review: {portrait.ambiguitySummary.pendingReviewCount}</p>
        <p>Conflict groups: {portrait.ambiguitySummary.conflictGroupCount}</p>
        <p>Affected members: {portrait.ambiguitySummary.affectedMemberCount}</p>
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
