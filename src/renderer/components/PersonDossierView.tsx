import type {
  ContextPackExportMode,
  MemoryWorkspaceScope,
  DossierDisplayType,
  PersonDossier,
  PersonDossierEvidenceRef,
  PersonDossierReviewShortcut
} from '../../shared/archiveContracts'

function formatDisplayType(displayType: DossierDisplayType) {
  return displayType.replace(/_/g, ' ')
}

function formatDate(value: string | null) {
  return value ?? 'Unknown'
}

function renderEvidenceRef(ref: PersonDossierEvidenceRef, onOpenEvidenceFile?: (fileId: string) => void) {
  if (ref.kind === 'file' && onOpenEvidenceFile) {
    return (
      <button key={`${ref.kind}:${ref.id}`} type="button" onClick={() => onOpenEvidenceFile(ref.id)}>
        {ref.label}
      </button>
    )
  }

  return (
    <span key={`${ref.kind}:${ref.id}`}>
      {ref.kind}: {ref.label}
    </span>
  )
}

export function PersonDossierView(props: {
  dossier: PersonDossier | null
  contextPackMode?: ContextPackExportMode
  contextPackDestination?: string
  contextPackStatus?: string
  isExportingContextPack?: boolean
  onChangeContextPackMode?: (mode: ContextPackExportMode) => void
  onPickContextPackDestination?: () => void
  onExportContextPack?: () => void
  onOpenEvidenceFile?: (fileId: string) => void
  onOpenReviewWorkbench?: (shortcut: PersonDossierReviewShortcut) => void
  onOpenGroupPortrait?: (canonicalPersonId: string) => void
  onOpenMemoryWorkspace?: (scope: MemoryWorkspaceScope) => void
}) {
  if (!props.dossier) {
    return <p>Select a person to open the dossier.</p>
  }

  const { dossier } = props

  return (
    <section>
      <h1>Person Dossier</h1>
      <button type="button" onClick={() => props.onOpenGroupPortrait?.(dossier.person.id)}>
        Open group portrait
      </button>
      <button
        type="button"
        onClick={() => props.onOpenMemoryWorkspace?.({ kind: 'person', canonicalPersonId: dossier.person.id })}
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

      <section aria-label="Identity Card">
        <h2>Identity Card</h2>
        <p>{dossier.identityCard.primaryDisplayName}</p>
        <p>Display type: {formatDisplayType(dossier.identityCard.displayType)}</p>
        <p>Aliases: {dossier.identityCard.aliases.join(', ') || 'None'}</p>
        <p>Labels: {dossier.identityCard.manualLabels.join(', ') || 'None'}</p>
        <p>First seen: {formatDate(dossier.identityCard.firstSeenAt)}</p>
        <p>Last seen: {formatDate(dossier.identityCard.lastSeenAt)}</p>
        <p>Evidence anchors: {dossier.identityCard.evidenceCount}</p>
      </section>

      <section aria-label="Thematic Portrait">
        <h2>Thematic Portrait</h2>
        {dossier.thematicSections.map((section) => (
          <section key={section.sectionKey}>
            <h3>{section.title}</h3>
            <p>Display type: {formatDisplayType(section.displayType)}</p>
            {section.displayType === 'coverage_gap' ? (
              section.items.map((item) => <p key={item.id}>{item.value}</p>)
            ) : (
              <ul>
                {section.items.map((item) => (
                  <li key={item.id}>
                    {item.label}: {item.value} · {formatDisplayType(item.displayType)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </section>

      <section aria-label="Timeline Highlights">
        <h2>Timeline Highlights</h2>
        {dossier.timelineHighlights.length ? (
          <ul>
            {dossier.timelineHighlights.map((highlight) => (
              <li key={highlight.eventId}>
                {highlight.title} · {formatDisplayType(highlight.displayType)}
                {highlight.summary ? ` · ${highlight.summary}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No approved timeline highlights yet.</p>
        )}
      </section>

      <section aria-label="Relationship Context">
        <h2>Relationship Context</h2>
        {dossier.relationshipSummary.length ? (
          <ul>
            {dossier.relationshipSummary.map((relationship) => (
              <li key={relationship.personId}>
                {relationship.displayName} · shared files {relationship.sharedFileCount}
                {relationship.manualLabel ? ` · ${relationship.manualLabel}` : ''}
                {' · '}
                {formatDisplayType(relationship.displayType)}
              </li>
            ))}
          </ul>
        ) : (
          <p>No approved relationship context yet.</p>
        )}
      </section>

      <section aria-label="Conflicts & Gaps">
        <h2>Conflicts & Gaps</h2>
        {dossier.conflictSummary.length ? (
          <ul>
            {dossier.conflictSummary.map((conflict) => (
              <li key={conflict.fieldKey ?? conflict.title}>
                {conflict.title} · pending {conflict.pendingCount} · {conflict.distinctValues.join(' / ')}
              </li>
            ))}
          </ul>
        ) : (
          <p>No open conflicts right now.</p>
        )}
        {dossier.coverageGaps.length ? (
          <ul>
            {dossier.coverageGaps.map((gap) => (
              <li key={gap.gapKey}>
                {gap.title}: {gap.detail}
              </li>
            ))}
          </ul>
        ) : (
          <p>No explicit coverage gaps right now.</p>
        )}
        {dossier.reviewShortcuts.length ? (
          <div>
            {dossier.reviewShortcuts.map((shortcut) => (
              <button
                key={`${shortcut.canonicalPersonId}:${shortcut.fieldKey ?? 'pending'}:${shortcut.queueItemId ?? 'none'}`}
                type="button"
                onClick={() => props.onOpenReviewWorkbench?.(shortcut)}
              >
                {shortcut.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section aria-label="Evidence Backtrace">
        <h2>Evidence Backtrace</h2>
        {dossier.evidenceBacktrace.length ? (
          <div>
            {dossier.evidenceBacktrace.map((ref) => renderEvidenceRef(ref, props.onOpenEvidenceFile))}
          </div>
        ) : (
          <p>No evidence backtrace anchors yet.</p>
        )}
      </section>
    </section>
  )
}
