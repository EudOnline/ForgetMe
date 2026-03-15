import type {
  MemoryWorkspaceBoundaryRedirect,
  MemoryWorkspaceCompareMatrixRowRecord,
  MemoryWorkspaceCompareMatrixSummary,
  MemoryWorkspaceCompareRunRecord,
  MemoryWorkspaceCompareSessionSummary,
  MemoryWorkspaceCitation,
  MemoryWorkspaceResponse,
  MemoryWorkspaceScope,
  MemoryWorkspaceSessionSummary,
  MemoryWorkspaceSuggestedAction,
  MemoryWorkspaceSuggestedAsk,
  MemoryWorkspaceTurnRecord
} from '../../shared/archiveContracts'

function formatDisplayType(displayType: string) {
  return displayType.replace(/_/g, ' ')
}

function normalizeSuggestedActions(boundaryRedirect: MemoryWorkspaceBoundaryRedirect) {
  const suggestedActions = boundaryRedirect.suggestedActions
  if (Array.isArray(suggestedActions)) {
    return suggestedActions
  }

  const legacySuggestedAsks = (
    boundaryRedirect as MemoryWorkspaceBoundaryRedirect & { suggestedAsks?: MemoryWorkspaceSuggestedAsk[] }
  ).suggestedAsks ?? []

  return legacySuggestedAsks.map((suggestion) => ({
    kind: 'ask',
    ...suggestion
  } satisfies MemoryWorkspaceSuggestedAction))
}

function renderCitation(
  citation: MemoryWorkspaceCitation,
  handlers: {
    onOpenPerson?: (canonicalPersonId: string) => void
    onOpenGroup?: (anchorPersonId: string) => void
    onOpenEvidenceFile?: (fileId: string) => void
    onOpenReviewHistory?: (citation: MemoryWorkspaceCitation) => void
  }
) {
  if (citation.kind === 'person' && handlers.onOpenPerson) {
    return (
      <button key={citation.citationId} type="button" onClick={() => handlers.onOpenPerson?.(citation.targetId)}>
        {citation.label}
      </button>
    )
  }

  if (citation.kind === 'group' && handlers.onOpenGroup) {
    return (
      <button key={citation.citationId} type="button" onClick={() => handlers.onOpenGroup?.(citation.targetId)}>
        {citation.label}
      </button>
    )
  }

  if (citation.kind === 'file' && handlers.onOpenEvidenceFile) {
    return (
      <button key={citation.citationId} type="button" onClick={() => handlers.onOpenEvidenceFile?.(citation.targetId)}>
        {citation.label}
      </button>
    )
  }

  if ((citation.kind === 'journal' || citation.kind === 'review') && handlers.onOpenReviewHistory) {
    return (
      <button key={citation.citationId} type="button" onClick={() => handlers.onOpenReviewHistory?.(citation)}>
        {citation.label}
      </button>
    )
  }

  return (
    <span key={citation.citationId}>
      {citation.label}
    </span>
  )
}

function scopePrompt(scope: MemoryWorkspaceScope) {
  if (scope.kind === 'person') {
    return 'Ask about this person’s approved facts, timeline, relationships, or open conflicts.'
  }

  if (scope.kind === 'group') {
    return 'Ask about this group’s shared events, timeline windows, or unresolved ambiguity.'
  }

  return 'Ask about the whole archive, people, groups, or review pressure.'
}

function sessionLabel(summary: MemoryWorkspaceSessionSummary) {
  return `${summary.title} · ${summary.latestQuestion ?? 'New session'}`
}

function compareSessionLabel(summary: MemoryWorkspaceCompareSessionSummary) {
  return `${summary.title} · ${summary.question}`
}

function compareSessionTargetsLabel(summary: MemoryWorkspaceCompareSessionSummary) {
  return summary.metadata.targetLabels.length
    ? summary.metadata.targetLabels.join(', ')
    : 'none'
}

function recommendationSourceLabel(source: 'deterministic' | 'judge_assisted') {
  return source === 'judge_assisted' ? 'judge-assisted' : 'deterministic'
}

function matrixScopeLabel(scope: MemoryWorkspaceScope) {
  if (scope.kind === 'person') {
    return `person:${scope.canonicalPersonId}`
  }

  if (scope.kind === 'group') {
    return `group:${scope.anchorPersonId}`
  }

  return 'global'
}

function matrixSessionLabel(summary: MemoryWorkspaceCompareMatrixSummary) {
  return summary.title
}

function matrixRowLabel(row: MemoryWorkspaceCompareMatrixRowRecord) {
  return `${row.label ?? `Row ${row.ordinal}`} · ${matrixScopeLabel(row.scope)} · ${row.question}`
}

function renderResponse(
  response: MemoryWorkspaceResponse,
  handlers: {
    onOpenPerson?: (canonicalPersonId: string) => void
    onOpenGroup?: (anchorPersonId: string) => void
    onOpenEvidenceFile?: (fileId: string) => void
    onOpenReviewHistory?: (citation: MemoryWorkspaceCitation) => void
    onRunSuggestedAction?: (suggestion: MemoryWorkspaceSuggestedAction) => void
  }
) {
  const suggestedActions = response.boundaryRedirect ? normalizeSuggestedActions(response.boundaryRedirect) : []

  return (
    <>
      <section aria-label="Answer">
        <h3>Answer</h3>
        <p>Mode: {response.expressionMode ?? 'grounded'}</p>
        <p>Workflow: {formatDisplayType(response.workflowKind ?? 'default')}</p>
        <p>{response.answer.summary}</p>
        <p>Display type: {formatDisplayType(response.answer.displayType)}</p>
        {response.answer.citations.length ? (
          <div>
            {response.answer.citations.map((citation) => renderCitation(citation, handlers))}
          </div>
        ) : null}
      </section>

      <section aria-label="Guardrails">
        <h3>Guardrails</h3>
        <p>{response.guardrail.decision}</p>
        <p>Fallback applied: {response.guardrail.fallbackApplied ? 'yes' : 'no'}</p>
        <p>Citation count: {response.guardrail.citationCount}</p>
        <p>Source kinds: {response.guardrail.sourceKinds.join(', ') || 'none'}</p>
        {response.guardrail.reasonCodes.length ? (
          <ul>
            {response.guardrail.reasonCodes.map((reasonCode) => (
              <li key={reasonCode}>{reasonCode}</li>
            ))}
          </ul>
        ) : (
          <p>No guardrail reasons triggered.</p>
        )}
      </section>

      {response.boundaryRedirect ? (
        <section aria-label="Boundary Redirect">
          <h3>Boundary redirect</h3>
          <p>{response.boundaryRedirect.title}</p>
          <p>{response.boundaryRedirect.message}</p>
          {response.boundaryRedirect.reasons.length ? (
            <ul>
              {response.boundaryRedirect.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {suggestedActions.length ? (
            <ul>
              {suggestedActions.map((suggestion) => (
                <li
                  key={`${suggestion.kind}:${suggestion.label}:${suggestion.expressionMode}:${suggestion.question}`}
                >
                  {handlers.onRunSuggestedAction ? (
                    <button type="button" onClick={() => handlers.onRunSuggestedAction?.(suggestion)}>
                      {suggestion.label}
                    </button>
                  ) : (
                    <strong>{suggestion.label}</strong>
                  )}
                  <p>Mode: {suggestion.expressionMode}</p>
                  <p>{suggestion.question}</p>
                  <p>{suggestion.rationale}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {response.communicationEvidence ? (
        <section aria-label="Communication Evidence">
          <h3>{response.communicationEvidence.title}</h3>
          <p>{response.communicationEvidence.summary}</p>
          <ul>
            {response.communicationEvidence.excerpts.map((excerpt) => (
              <li key={excerpt.excerptId}>
                <p>{excerpt.speakerDisplayName ?? 'Unknown speaker'}</p>
                <p>{excerpt.text}</p>
                <p>
                  Source:{' '}
                  {handlers.onOpenEvidenceFile ? (
                    <button type="button" onClick={() => handlers.onOpenEvidenceFile?.(excerpt.fileId)}>
                      {excerpt.fileName}
                    </button>
                  ) : (
                    <span>{excerpt.fileName}</span>
                  )}
                  {' '}
                  · Ordinal: {excerpt.ordinal}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {response.personaDraft ? (
        <section aria-label="Persona Draft Sandbox">
          <h3>{response.personaDraft.title}</h3>
          <p>{response.personaDraft.disclaimer}</p>
          <p>{response.personaDraft.draft}</p>
          <p>{response.personaDraft.reviewState}</p>
          {response.personaDraft.supportingExcerpts.length ? (
            <p>Supporting excerpts: {response.personaDraft.supportingExcerpts.join(', ')}</p>
          ) : null}
          {response.personaDraft.trace.length ? (
            <ul>
              {response.personaDraft.trace.map((trace) => (
                <li key={trace.traceId}>
                  <p>{trace.explanation}</p>
                  <p>Excerpt ids: {trace.excerptIds.join(', ')}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Context Cards">
        <h3>Context Cards</h3>
        {response.contextCards.map((card) => (
          <section key={card.cardId} aria-label={card.title}>
            <h4>{card.title}</h4>
            <p>{card.body}</p>
            <p>Display type: {formatDisplayType(card.displayType)}</p>
            {card.citations.length ? (
              <div>
                {card.citations.map((citation) => renderCitation(citation, handlers))}
              </div>
            ) : null}
          </section>
        ))}
      </section>
    </>
  )
}

function renderCompareRun(
  run: MemoryWorkspaceCompareRunRecord,
  handlers: {
    onOpenPerson?: (canonicalPersonId: string) => void
    onOpenGroup?: (anchorPersonId: string) => void
    onOpenEvidenceFile?: (fileId: string) => void
    onOpenReviewHistory?: (citation: MemoryWorkspaceCitation) => void
  }
) {
  return (
    <section key={run.compareRunId} aria-label={`Compare Run ${run.ordinal}`}>
      <h3>{run.target.label}</h3>
      <p>Status: {run.status}</p>
      <p>Provider: {run.provider ?? 'local'}</p>
      <p>Model: {run.model ?? 'baseline'}</p>
      <p>Score: {run.evaluation.totalScore}/{run.evaluation.maxScore}</p>
      <p>Band: {run.evaluation.band}</p>
      <ul aria-label={`Compare Scorecard ${run.ordinal}`}>
        {run.evaluation.dimensions.map((dimension) => (
          <li key={dimension.key}>
            <strong>{dimension.label}</strong>
            {' '}
            ·
            {' '}
            {dimension.score}/{dimension.maxScore}
            {' '}
            ·
            {' '}
            {dimension.rationale}
          </li>
        ))}
      </ul>
      <section aria-label={`Judge Verdict ${run.ordinal}`}>
        <h4>Judge verdict</h4>
        <p>Judge status: {run.judge.status}</p>
        {run.judge.model ? <p>Judge model: {run.judge.model}</p> : null}
        {run.judge.status === 'completed' ? (
          <>
            <p>Judge decision: {run.judge.decision}</p>
            <p>Judge score: {run.judge.score}/5</p>
          </>
        ) : null}
        {run.judge.rationale ? <p>{run.judge.rationale}</p> : null}
        {run.judge.strengths.length ? (
          <ul aria-label={`Judge Strengths ${run.ordinal}`}>
            {run.judge.strengths.map((strength) => (
              <li key={strength}>{strength}</li>
            ))}
          </ul>
        ) : null}
        {run.judge.concerns.length ? (
          <ul aria-label={`Judge Concerns ${run.ordinal}`}>
            {run.judge.concerns.map((concern) => (
              <li key={concern}>{concern}</li>
            ))}
          </ul>
        ) : null}
        {run.judge.errorMessage ? <p>Judge error: {run.judge.errorMessage}</p> : null}
      </section>
      {run.errorMessage ? <p>Error: {run.errorMessage}</p> : null}
      {run.response ? renderResponse(run.response, handlers) : null}
    </section>
  )
}

export function MemoryWorkspaceView(props: {
  scope: MemoryWorkspaceScope
  matrixSummaries: MemoryWorkspaceCompareMatrixSummary[]
  selectedMatrixSessionId: string | null
  matrixRows: MemoryWorkspaceCompareMatrixRowRecord[]
  sessionSummaries: MemoryWorkspaceSessionSummary[]
  selectedSessionId: string | null
  turns: MemoryWorkspaceTurnRecord[]
  compareSessionSummaries: MemoryWorkspaceCompareSessionSummary[]
  selectedCompareSessionId: string | null
  compareRuns: MemoryWorkspaceCompareRunRecord[]
  hasLoadedMatrices?: boolean
  hasLoadedSessions?: boolean
  hasLoadedCompareSessions?: boolean
  isLoadingMatrices?: boolean
  isLoading?: boolean
  isLoadingSessions?: boolean
  isComparing?: boolean
  isRunningMatrix?: boolean
  isLoadingCompareSessions?: boolean
  emptyStateMessage?: string | null
  compareEmptyStateMessage?: string | null
  onSelectMatrixSession?: (matrixSessionId: string) => void
  onOpenMatrixRowCompare?: (row: MemoryWorkspaceCompareMatrixRowRecord) => void
  onSelectSession?: (sessionId: string) => void
  onSelectCompareSession?: (compareSessionId: string) => void
  onStartNewSession?: () => void
  onOpenPerson?: (canonicalPersonId: string) => void
  onOpenGroup?: (anchorPersonId: string) => void
  onOpenEvidenceFile?: (fileId: string) => void
  onOpenReviewHistory?: (citation: MemoryWorkspaceCitation) => void
  onRunSuggestedAction?: (suggestion: MemoryWorkspaceSuggestedAction) => void
}) {
  const activeResponse = props.turns[props.turns.length - 1]?.response ?? null
  const promptMessage =
    props.emptyStateMessage ??
    (props.hasLoadedSessions && props.sessionSummaries.length === 0
      ? 'No saved sessions for this scope yet.'
      : scopePrompt(props.scope))
  const shouldShowPrompt =
    !props.turns.length &&
    !props.isLoading &&
    (!props.hasLoadedSessions || props.sessionSummaries.length > 0 || Boolean(props.emptyStateMessage))

  return (
    <section>
      <h1>Memory Workspace</h1>
      {props.hasLoadedMatrices ? (
        <section aria-label="Saved Compare Matrices">
          <h2>Saved Compare Matrices</h2>
          {props.matrixSummaries.length ? (
            <>
              <ul>
                {props.matrixSummaries.map((summary) => (
                  <li key={summary.matrixSessionId}>
                    <button
                      type="button"
                      aria-pressed={summary.matrixSessionId === props.selectedMatrixSessionId}
                      onClick={() => props.onSelectMatrixSession?.(summary.matrixSessionId)}
                      disabled={!props.onSelectMatrixSession}
                    >
                      {matrixSessionLabel(summary)}
                    </button>
                    <p>Mode: {summary.expressionMode}</p>
                    <p>Rows: {summary.rowCount} · Completed: {summary.completedRowCount} · Failed: {summary.failedRowCount}</p>
                    <p>Targets: {summary.metadata.targetLabels.join(', ') || 'none'}</p>
                    <p>Judge: {summary.metadata.judge.status}</p>
                  </li>
                ))}
              </ul>
              {props.matrixRows.length ? (
                <section aria-label="Matrix Rows">
                  <h3>Matrix Rows</h3>
                  <ul>
                    {props.matrixRows.map((row) => (
                      <li key={row.matrixRowId}>
                        <button
                          type="button"
                          onClick={() => props.onOpenMatrixRowCompare?.(row)}
                          disabled={!props.onOpenMatrixRowCompare || !row.compareSessionId}
                        >
                          {matrixRowLabel(row)}
                        </button>
                        <p>Status: {row.status}</p>
                        {row.recommendedTargetLabel ? <p>Recommended: {row.recommendedTargetLabel}</p> : null}
                        {row.failedRunCount > 0 ? <p>Failed runs: {row.failedRunCount}</p> : null}
                        {row.errorMessage ? <p>Error: {row.errorMessage}</p> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : (
            <p>No saved compare matrices yet.</p>
          )}
        </section>
      ) : null}

      {props.hasLoadedSessions ? (
        <section aria-label="Saved Sessions">
          <h2>Saved Sessions</h2>
          {props.sessionSummaries.length ? (
            <>
              <button type="button" onClick={props.onStartNewSession} disabled={!props.onStartNewSession}>
                Start new session
              </button>
              <ul>
                {props.sessionSummaries.map((summary) => (
                  <li key={summary.sessionId}>
                    <button
                      type="button"
                      aria-pressed={summary.sessionId === props.selectedSessionId}
                      onClick={() => props.onSelectSession?.(summary.sessionId)}
                      disabled={!props.onSelectSession}
                    >
                      {sessionLabel(summary)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>No saved sessions for this scope yet.</p>
          )}
        </section>
      ) : null}

      {shouldShowPrompt ? <p>{promptMessage}</p> : null}
      {props.isLoading ? <p>Asking memory workspace…</p> : null}
      {activeResponse ? (
        <section aria-label="Workspace Response">
          <h2>{activeResponse.title}</h2>
          {props.turns.map((turn) => (
            <section key={turn.turnId} aria-label={`Turn ${turn.ordinal}`}>
              <h3>{turn.question}</h3>
              <p>{turn.createdAt}</p>
              {renderResponse(turn.response, props)}
            </section>
          ))}
        </section>
      ) : null}

      {props.hasLoadedCompareSessions ? (
        <section aria-label="Saved Compare Sessions">
          <h2>Saved Compare Sessions</h2>
          {props.compareSessionSummaries.length ? (
            <ul>
              {props.compareSessionSummaries.map((summary) => (
                <li key={summary.compareSessionId}>
                  <button
                    type="button"
                    aria-pressed={summary.compareSessionId === props.selectedCompareSessionId}
                    onClick={() => props.onSelectCompareSession?.(summary.compareSessionId)}
                    disabled={!props.onSelectCompareSession}
                  >
                    {compareSessionLabel(summary)}
                  </button>
                  <p>Mode: {summary.expressionMode}</p>
                  <p>Targets: {compareSessionTargetsLabel(summary)}</p>
                  <p>Judge: {summary.metadata.judge.status}</p>
                  {summary.metadata.failedRunCount > 0 ? <p>Failed runs: {summary.metadata.failedRunCount}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No saved compare sessions for this scope yet.</p>
          )}
        </section>
      ) : null}

      {props.isComparing ? <p>Running compare…</p> : null}
      {props.compareEmptyStateMessage ? <p>{props.compareEmptyStateMessage}</p> : null}
      {props.compareRuns.length ? (
        <section aria-label="Compare Results">
          <h2>Compare Results</h2>
          {props.compareSessionSummaries.find((summary) => summary.compareSessionId === props.selectedCompareSessionId)?.recommendation ? (
            <section aria-label="Recommended Compare Result">
              <h3>Recommended result</h3>
              <p>
                Recommendation source:
                {' '}
                {
                  recommendationSourceLabel(
                    props.compareSessionSummaries.find((summary) => summary.compareSessionId === props.selectedCompareSessionId)?.recommendation?.source
                    ?? 'deterministic'
                  )
                }
              </p>
              <p>
                {
                  props.compareSessionSummaries.find((summary) => summary.compareSessionId === props.selectedCompareSessionId)?.recommendation?.recommendedTargetLabel
                  ?? 'No recommendation'
                }
              </p>
              <p>
                {
                  props.compareSessionSummaries.find((summary) => summary.compareSessionId === props.selectedCompareSessionId)?.recommendation?.rationale
                }
              </p>
            </section>
          ) : null}
          {props.compareRuns.map((run) => renderCompareRun(run, props))}
        </section>
      ) : null}
    </section>
  )
}
