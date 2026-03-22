import type {
  ContextPackExportMode,
  MemoryWorkspaceScope,
  DossierDisplayType,
  PersonDossier,
  PersonDossierEvidenceRef,
  PersonDossierReviewShortcut
} from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

function formatDisplayType(displayType: DossierDisplayType) {
  return displayType.replace(/_/g, ' ')
}

function formatDate(value: string | null, unknownLabel: string) {
  return value ?? unknownLabel
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
  const { t } = useI18n()

  if (!props.dossier) {
    return <p>{t('personDossier.select')}</p>
  }

  const { dossier } = props

  return (
    <section>
      <h1>{t('personDossier.title')}</h1>
      <button type="button" onClick={() => props.onOpenGroupPortrait?.(dossier.person.id)}>
        {t('personDossier.openGroupPortrait')}
      </button>
      <button
        type="button"
        onClick={() => props.onOpenMemoryWorkspace?.({ kind: 'person', canonicalPersonId: dossier.person.id })}
      >
        {t('personDossier.openMemoryWorkspace')}
      </button>

      <section aria-label={t('personDossier.contextPack.title')}>
        <h2>{t('personDossier.contextPack.title')}</h2>
        <label>
          {t('personDossier.contextPack.mode')}
          <select
            value={props.contextPackMode ?? 'approved_plus_derived'}
            onChange={(event) => props.onChangeContextPackMode?.(event.target.value as ContextPackExportMode)}
          >
            <option value="approved_plus_derived">{t('personDossier.contextPack.mode.approvedPlusDerived')}</option>
            <option value="approved_only">{t('personDossier.contextPack.mode.approvedOnly')}</option>
          </select>
        </label>
        <div>{props.contextPackDestination || t('personDossier.contextPack.noDestination')}</div>
        <div>
          <button
            type="button"
            onClick={() => props.onPickContextPackDestination?.()}
            disabled={props.isExportingContextPack}
          >
            {t('personDossier.contextPack.chooseDestination')}
          </button>
          <button
            type="button"
            onClick={() => props.onExportContextPack?.()}
            disabled={props.isExportingContextPack}
          >
            {t('personDossier.contextPack.export')}
          </button>
        </div>
        {props.contextPackStatus ? <p>{props.contextPackStatus}</p> : null}
      </section>

      <section aria-label={t('personDossier.identityCard.title')}>
        <h2>{t('personDossier.identityCard.title')}</h2>
        <p>{dossier.identityCard.primaryDisplayName}</p>
        <p>{t('personDossier.identityCard.displayType')}: {formatDisplayType(dossier.identityCard.displayType)}</p>
        <p>{t('personDossier.identityCard.aliases')}: {dossier.identityCard.aliases.join(', ') || t('common.none')}</p>
        <p>{t('personDossier.identityCard.labels')}: {dossier.identityCard.manualLabels.join(', ') || t('common.none')}</p>
        <p>{t('personDossier.identityCard.firstSeen')}: {formatDate(dossier.identityCard.firstSeenAt, t('personDossier.unknownDate'))}</p>
        <p>{t('personDossier.identityCard.lastSeen')}: {formatDate(dossier.identityCard.lastSeenAt, t('personDossier.unknownDate'))}</p>
        <p>{t('personDossier.identityCard.evidenceAnchors')}: {dossier.identityCard.evidenceCount}</p>
      </section>

      <section aria-label={t('personDossier.thematicPortrait.title')}>
        <h2>{t('personDossier.thematicPortrait.title')}</h2>
        {dossier.thematicSections.map((section) => (
          <section key={section.sectionKey}>
            <h3>{section.title}</h3>
            <p>{t('personDossier.identityCard.displayType')}: {formatDisplayType(section.displayType)}</p>
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

      <section aria-label={t('personDossier.timelineHighlights.title')}>
        <h2>{t('personDossier.timelineHighlights.title')}</h2>
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
          <p>{t('personDossier.timelineHighlights.none')}</p>
        )}
      </section>

      <section aria-label={t('personDossier.relationshipContext.title')}>
        <h2>{t('personDossier.relationshipContext.title')}</h2>
        {dossier.relationshipSummary.length ? (
          <ul>
            {dossier.relationshipSummary.map((relationship) => (
              <li key={relationship.personId}>
                {relationship.displayName} · {t('personDossier.relationshipContext.sharedFiles', { count: relationship.sharedFileCount })}
                {relationship.manualLabel ? ` · ${relationship.manualLabel}` : ''}
                {' · '}
                {formatDisplayType(relationship.displayType)}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('personDossier.relationshipContext.none')}</p>
        )}
      </section>

      <section aria-label={t('personDossier.conflictsGaps.title')}>
        <h2>{t('personDossier.conflictsGaps.title')}</h2>
        {dossier.conflictSummary.length ? (
          <ul>
            {dossier.conflictSummary.map((conflict) => (
              <li key={conflict.fieldKey ?? conflict.title}>
                {conflict.title} · {t('personDossier.conflictsGaps.pendingCount', { count: conflict.pendingCount })} · {conflict.distinctValues.join(' / ')}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('personDossier.conflictsGaps.none')}</p>
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
          <p>{t('personDossier.coverageGaps.none')}</p>
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

      <section aria-label={t('personDossier.evidenceBacktrace.title')}>
        <h2>{t('personDossier.evidenceBacktrace.title')}</h2>
        {dossier.evidenceBacktrace.length ? (
          <div>
            {dossier.evidenceBacktrace.map((ref) => renderEvidenceRef(ref, props.onOpenEvidenceFile))}
          </div>
        ) : (
          <p>{t('personDossier.evidenceBacktrace.none')}</p>
        )}
      </section>
    </section>
  )
}
