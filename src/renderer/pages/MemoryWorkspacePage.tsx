import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  MemoryWorkspaceCompareTarget,
  MemoryWorkspaceCompareRunRecord,
  MemoryWorkspaceCompareSessionSummary,
  MemoryWorkspaceCitation,
  MemoryWorkspaceScope,
  MemoryWorkspaceSessionSummary,
  MemoryWorkspaceTurnRecord,
  RunMemoryWorkspaceCompareJudgeInput
} from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { MemoryWorkspaceView } from '../components/MemoryWorkspaceView'

const compareJudgeDefaultsStorageKey = 'forgetme.memoryWorkspace.compareJudgeDefaults'
const compareTargetDefaultsStorageKey = 'forgetme.memoryWorkspace.compareTargetDefaults'
const defaultCompareTargetModels = {
  siliconflow: 'Qwen/Qwen2.5-72B-Instruct',
  openrouter: 'qwen/qwen-2.5-72b-instruct'
} as const

type CompareJudgeDefaults = {
  enabled: boolean
  provider: NonNullable<RunMemoryWorkspaceCompareJudgeInput['provider']>
  model: string
}

type CompareTargetControls = {
  localBaselineEnabled: boolean
  siliconflowEnabled: boolean
  siliconflowModel: string
  openrouterEnabled: boolean
  openrouterModel: string
}

function defaultCompareJudgeDefaults(): CompareJudgeDefaults {
  return {
    enabled: false,
    provider: 'siliconflow',
    model: ''
  }
}

function isCompareJudgeProvider(
  value: unknown
): value is NonNullable<RunMemoryWorkspaceCompareJudgeInput['provider']> {
  return value === 'siliconflow' || value === 'openrouter'
}

function readStoredCompareJudgeDefaults(): CompareJudgeDefaults {
  const defaults = defaultCompareJudgeDefaults()

  if (typeof window === 'undefined') {
    return defaults
  }

  try {
    const rawValue = window.localStorage.getItem(compareJudgeDefaultsStorageKey)
    if (!rawValue) {
      return defaults
    }

    const parsedValue = JSON.parse(rawValue) as Record<string, unknown>

    return {
      enabled: parsedValue.enabled === true,
      provider: isCompareJudgeProvider(parsedValue.provider) ? parsedValue.provider : defaults.provider,
      model: typeof parsedValue.model === 'string' ? parsedValue.model : defaults.model
    }
  } catch {
    return defaults
  }
}

function writeStoredCompareJudgeDefaults(defaults: CompareJudgeDefaults) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(compareJudgeDefaultsStorageKey, JSON.stringify(defaults))
  } catch {
    return
  }
}

function defaultCompareTargetControls(): CompareTargetControls {
  return {
    localBaselineEnabled: true,
    siliconflowEnabled: true,
    siliconflowModel: defaultCompareTargetModels.siliconflow,
    openrouterEnabled: true,
    openrouterModel: defaultCompareTargetModels.openrouter
  }
}

function readStoredCompareTargetDefaults(): CompareTargetControls {
  const defaults = defaultCompareTargetControls()

  if (typeof window === 'undefined') {
    return defaults
  }

  try {
    const rawValue = window.localStorage.getItem(compareTargetDefaultsStorageKey)
    if (!rawValue) {
      return defaults
    }

    const parsedValue = JSON.parse(rawValue) as Record<string, unknown>

    return {
      localBaselineEnabled: parsedValue.localBaselineEnabled === false ? false : defaults.localBaselineEnabled,
      siliconflowEnabled: parsedValue.siliconflowEnabled === false ? false : defaults.siliconflowEnabled,
      siliconflowModel: typeof parsedValue.siliconflowModel === 'string' ? parsedValue.siliconflowModel : defaults.siliconflowModel,
      openrouterEnabled: parsedValue.openrouterEnabled === false ? false : defaults.openrouterEnabled,
      openrouterModel: typeof parsedValue.openrouterModel === 'string' ? parsedValue.openrouterModel : defaults.openrouterModel
    }
  } catch {
    return defaults
  }
}

function writeStoredCompareTargetDefaults(defaults: CompareTargetControls) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(compareTargetDefaultsStorageKey, JSON.stringify(defaults))
  } catch {
    return
  }
}

function normalizedCompareTargetModel(
  value: string,
  provider: keyof typeof defaultCompareTargetModels
) {
  return value.trim() || defaultCompareTargetModels[provider]
}

function buildCompareTargets(controls: CompareTargetControls): MemoryWorkspaceCompareTarget[] {
  const targets: MemoryWorkspaceCompareTarget[] = []

  if (controls.localBaselineEnabled) {
    targets.push({
      targetId: 'baseline-local',
      label: 'Local baseline',
      executionMode: 'local_baseline'
    })
  }

  if (controls.siliconflowEnabled) {
    targets.push({
      targetId: 'siliconflow-qwen25-72b',
      label: 'SiliconFlow / Qwen2.5-72B-Instruct',
      executionMode: 'provider_model',
      provider: 'siliconflow',
      model: normalizedCompareTargetModel(controls.siliconflowModel, 'siliconflow')
    })
  }

  if (controls.openrouterEnabled) {
    targets.push({
      targetId: 'openrouter-qwen25-72b',
      label: 'OpenRouter / qwen-2.5-72b-instruct',
      executionMode: 'provider_model',
      provider: 'openrouter',
      model: normalizedCompareTargetModel(controls.openrouterModel, 'openrouter')
    })
  }

  return targets
}

function compareTargetControlsMatchDefaults(controls: CompareTargetControls) {
  return (
    controls.localBaselineEnabled
    && controls.siliconflowEnabled
    && controls.openrouterEnabled
    && normalizedCompareTargetModel(controls.siliconflowModel, 'siliconflow') === defaultCompareTargetModels.siliconflow
    && normalizedCompareTargetModel(controls.openrouterModel, 'openrouter') === defaultCompareTargetModels.openrouter
  )
}

function inferCompareTargetControlsFromRuns(runs: MemoryWorkspaceCompareRunRecord[]): CompareTargetControls {
  const defaults = defaultCompareTargetControls()
  const siliconflowRun = runs.find((run) => run.target.executionMode === 'provider_model' && run.target.provider === 'siliconflow')
  const openrouterRun = runs.find((run) => run.target.executionMode === 'provider_model' && run.target.provider === 'openrouter')

  return {
    localBaselineEnabled: runs.some((run) => run.target.executionMode === 'local_baseline'),
    siliconflowEnabled: Boolean(siliconflowRun),
    siliconflowModel: siliconflowRun?.target.model ?? siliconflowRun?.model ?? defaults.siliconflowModel,
    openrouterEnabled: Boolean(openrouterRun),
    openrouterModel: openrouterRun?.target.model ?? openrouterRun?.model ?? defaults.openrouterModel
  }
}

function inferCompareJudgeDefaultsFromRuns(runs: MemoryWorkspaceCompareRunRecord[]): CompareJudgeDefaults {
  const defaults = defaultCompareJudgeDefaults()
  const judgeRun = runs.find((run) =>
    run.judge.status !== 'skipped'
    || run.judge.provider !== null
    || run.judge.model !== null
  )

  if (!judgeRun) {
    return defaults
  }

  return {
    enabled: true,
    provider: judgeRun.judge.provider ?? defaults.provider,
    model: judgeRun.judge.model ?? defaults.model
  }
}

function initialQuestionForScope(scope: MemoryWorkspaceScope) {
  if (scope.kind === 'person') {
    return ''
  }

  if (scope.kind === 'group') {
    return ''
  }

  return ''
}

function scopeKey(scope: MemoryWorkspaceScope) {
  if (scope.kind === 'person') {
    return `person:${scope.canonicalPersonId}`
  }

  if (scope.kind === 'group') {
    return `group:${scope.anchorPersonId}`
  }

  return 'global'
}

export function MemoryWorkspacePage(props: {
  scope: MemoryWorkspaceScope
  onOpenPerson?: (canonicalPersonId: string) => void
  onOpenGroup?: (anchorPersonId: string) => void
  onOpenEvidenceFile?: (fileId: string) => void
  onOpenReviewHistory?: (citation: MemoryWorkspaceCitation) => void
}) {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const scopeIdentity = scopeKey(props.scope)
  const scopeRequestRef = useRef(0)
  const [question, setQuestion] = useState(() => initialQuestionForScope(props.scope))
  const [sessionSummaries, setSessionSummaries] = useState<MemoryWorkspaceSessionSummary[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [turns, setTurns] = useState<MemoryWorkspaceTurnRecord[]>([])
  const [compareSessionSummaries, setCompareSessionSummaries] = useState<MemoryWorkspaceCompareSessionSummary[]>([])
  const [selectedCompareSessionId, setSelectedCompareSessionId] = useState<string | null>(null)
  const [compareRuns, setCompareRuns] = useState<MemoryWorkspaceCompareRunRecord[]>([])
  const [hasLoadedSessions, setHasLoadedSessions] = useState(false)
  const [hasLoadedCompareSessions, setHasLoadedCompareSessions] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [isLoadingCompareSessions, setIsLoadingCompareSessions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isComparing, setIsComparing] = useState(false)
  const [emptyStateMessage, setEmptyStateMessage] = useState<string | null>(null)
  const [compareEmptyStateMessage, setCompareEmptyStateMessage] = useState<string | null>(null)
  const [compareTargetControls, setCompareTargetControls] = useState<CompareTargetControls>(() => readStoredCompareTargetDefaults())
  const [compareJudgeEnabled, setCompareJudgeEnabled] = useState(() => readStoredCompareJudgeDefaults().enabled)
  const [compareJudgeProvider, setCompareJudgeProvider] = useState<NonNullable<RunMemoryWorkspaceCompareJudgeInput['provider']>>(
    () => readStoredCompareJudgeDefaults().provider
  )
  const [compareJudgeModel, setCompareJudgeModel] = useState(() => readStoredCompareJudgeDefaults().model)
  const selectedCompareSummary = compareSessionSummaries.find((summary) => summary.compareSessionId === selectedCompareSessionId) ?? null
  const selectedCompareTargets = buildCompareTargets(compareTargetControls)
  const compareUsesCustomTargets = !compareTargetControlsMatchDefaults(compareTargetControls)

  const loadSessionDetail = async (sessionId: string, scopeRequestId: number, preserveTurns = false) => {
    const session = await archiveApi.getMemoryWorkspaceSession(sessionId)
    if (scopeRequestId !== scopeRequestRef.current) {
      return
    }

    if (session) {
      setTurns(session.turns)
      return
    }

    if (!preserveTurns) {
      setTurns([])
    }
  }

  const refreshSessions = async (options?: {
    scopeRequestId?: number
    preferredSessionId?: string | null
    preserveTurns?: boolean
  }) => {
    const scopeRequestId = options?.scopeRequestId ?? scopeRequestRef.current
    const preferredSessionId = options?.preferredSessionId ?? null
    const preserveTurns = options?.preserveTurns ?? false
    const sessions = await archiveApi.listMemoryWorkspaceSessions({ scope: props.scope })
    if (scopeRequestId !== scopeRequestRef.current) {
      return
    }

    setSessionSummaries(sessions)
    setHasLoadedSessions(true)

    const nextSessionId = preferredSessionId ?? sessions[0]?.sessionId ?? null
    if (!nextSessionId) {
      if (!preserveTurns) {
        setSelectedSessionId(null)
        setTurns([])
      }
      return
    }

    setSelectedSessionId(nextSessionId)
    await loadSessionDetail(nextSessionId, scopeRequestId, preserveTurns)
  }

  const loadCompareSessionDetail = async (
    compareSessionId: string,
    scopeRequestId: number,
    preserveRuns = false
  ) => {
    const session = await archiveApi.getMemoryWorkspaceCompareSession(compareSessionId)
    if (scopeRequestId !== scopeRequestRef.current) {
      return
    }

    if (session) {
      setCompareRuns(session.runs)
      return
    }

    if (!preserveRuns) {
      setCompareRuns([])
    }
  }

  const refreshCompareSessions = async (options?: {
    scopeRequestId?: number
    preferredCompareSessionId?: string | null
    preserveRuns?: boolean
  }) => {
    const scopeRequestId = options?.scopeRequestId ?? scopeRequestRef.current
    const preferredCompareSessionId = options?.preferredCompareSessionId ?? null
    const preserveRuns = options?.preserveRuns ?? false
    const sessions = await archiveApi.listMemoryWorkspaceCompareSessions({ scope: props.scope })
    if (scopeRequestId !== scopeRequestRef.current) {
      return
    }

    setCompareSessionSummaries(sessions)
    setHasLoadedCompareSessions(true)

    const nextCompareSessionId = preferredCompareSessionId ?? sessions[0]?.compareSessionId ?? null
    if (!nextCompareSessionId) {
      if (!preserveRuns) {
        setSelectedCompareSessionId(null)
        setCompareRuns([])
      }
      return
    }

    setSelectedCompareSessionId(nextCompareSessionId)
    await loadCompareSessionDetail(nextCompareSessionId, scopeRequestId, preserveRuns)
  }

  useEffect(() => {
    const scopeRequestId = scopeRequestRef.current + 1
    const storedCompareTargetDefaults = readStoredCompareTargetDefaults()
    const storedCompareJudgeDefaults = readStoredCompareJudgeDefaults()
    scopeRequestRef.current = scopeRequestId
    setQuestion(initialQuestionForScope(props.scope))
    setSessionSummaries([])
    setSelectedSessionId(null)
    setTurns([])
    setCompareSessionSummaries([])
    setSelectedCompareSessionId(null)
    setCompareRuns([])
    setHasLoadedSessions(false)
    setHasLoadedCompareSessions(false)
    setEmptyStateMessage(null)
    setCompareEmptyStateMessage(null)
    setCompareTargetControls(storedCompareTargetDefaults)
    setCompareJudgeEnabled(storedCompareJudgeDefaults.enabled)
    setCompareJudgeProvider(storedCompareJudgeDefaults.provider)
    setCompareJudgeModel(storedCompareJudgeDefaults.model)
    setIsLoadingSessions(true)
    setIsLoadingCompareSessions(true)

    void refreshSessions({ scopeRequestId })
      .finally(() => {
        if (scopeRequestId === scopeRequestRef.current) {
          setIsLoadingSessions(false)
        }
      })

    void refreshCompareSessions({ scopeRequestId })
      .finally(() => {
        if (scopeRequestId === scopeRequestRef.current) {
          setIsLoadingCompareSessions(false)
        }
      })
  }, [archiveApi, props.scope, scopeIdentity])

  useEffect(() => {
    writeStoredCompareTargetDefaults(compareTargetControls)
  }, [compareTargetControls])

  useEffect(() => {
    writeStoredCompareJudgeDefaults({
      enabled: compareJudgeEnabled,
      provider: compareJudgeProvider,
      model: compareJudgeModel
    })
  }, [compareJudgeEnabled, compareJudgeProvider, compareJudgeModel])

  const handleSelectSession = async (sessionId: string) => {
    const scopeRequestId = scopeRequestRef.current
    setSelectedSessionId(sessionId)
    setEmptyStateMessage(null)
    setIsLoadingSessions(true)

    await loadSessionDetail(sessionId, scopeRequestId)

    if (scopeRequestId === scopeRequestRef.current) {
      setIsLoadingSessions(false)
    }
  }

  const handleStartNewSession = () => {
    setSelectedSessionId(null)
    setTurns([])
    setEmptyStateMessage(null)
  }

  const handleSelectCompareSession = async (compareSessionId: string) => {
    const scopeRequestId = scopeRequestRef.current
    setSelectedCompareSessionId(compareSessionId)
    setCompareEmptyStateMessage(null)
    setIsLoadingCompareSessions(true)

    await loadCompareSessionDetail(compareSessionId, scopeRequestId)

    if (scopeRequestId === scopeRequestRef.current) {
      setIsLoadingCompareSessions(false)
    }
  }

  const handleUseSelectedCompareSetup = () => {
    if (!selectedCompareSummary || compareRuns.length === 0) {
      return
    }

    const inferredTargetControls = inferCompareTargetControlsFromRuns(compareRuns)
    const inferredJudgeDefaults = inferCompareJudgeDefaultsFromRuns(compareRuns)

    setQuestion(selectedCompareSummary.question)
    setCompareTargetControls(inferredTargetControls)
    setCompareJudgeEnabled(inferredJudgeDefaults.enabled)
    setCompareJudgeProvider(inferredJudgeDefaults.provider)
    setCompareJudgeModel(inferredJudgeDefaults.model)
    setCompareEmptyStateMessage(null)
  }

  const handleAsk = async () => {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) {
      return
    }

    const scopeRequestId = scopeRequestRef.current
    setIsLoading(true)
    setEmptyStateMessage(null)

    try {
      const nextTurn = await archiveApi.askMemoryWorkspacePersisted({
        scope: props.scope,
        question: trimmedQuestion,
        ...(selectedSessionId ? { sessionId: selectedSessionId } : {})
      })

      if (scopeRequestId !== scopeRequestRef.current) {
        return
      }

      if (!nextTurn) {
        setEmptyStateMessage('No grounded workspace is available for this scope yet.')
        return
      }

      setSelectedSessionId(nextTurn.sessionId)
      setTurns((previousTurns) => {
        const canAppend =
          previousTurns.length > 0 &&
          previousTurns.every((turn) => turn.sessionId === nextTurn.sessionId) &&
          !previousTurns.some((turn) => turn.turnId === nextTurn.turnId)

        if (canAppend) {
          return [...previousTurns, nextTurn]
        }

        return [nextTurn]
      })
      setQuestion(initialQuestionForScope(props.scope))

      await refreshSessions({
        scopeRequestId,
        preferredSessionId: nextTurn.sessionId,
        preserveTurns: true
      })
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setIsLoading(false)
      }
    }
  }

  const handleRunCompare = async () => {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || selectedCompareTargets.length === 0) {
      return
    }

    const scopeRequestId = scopeRequestRef.current
    setIsComparing(true)
    setCompareEmptyStateMessage(null)

    try {
      const compareSession = await archiveApi.runMemoryWorkspaceCompare({
        scope: props.scope,
        question: trimmedQuestion,
        ...(compareUsesCustomTargets ? { targets: selectedCompareTargets } : {}),
        judge: compareJudgeEnabled
          ? {
              enabled: true,
              provider: compareJudgeProvider,
              ...(compareJudgeModel.trim().length > 0 ? { model: compareJudgeModel.trim() } : {})
            }
          : {
              enabled: false
            }
      })

      if (scopeRequestId !== scopeRequestRef.current) {
        return
      }

      if (!compareSession) {
        setCompareEmptyStateMessage('No compare result is available for this scope yet.')
        return
      }

      setSelectedCompareSessionId(compareSession.compareSessionId)
      setCompareRuns(compareSession.runs)

      await refreshCompareSessions({
        scopeRequestId,
        preferredCompareSessionId: compareSession.compareSessionId,
        preserveRuns: true
      })
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setIsComparing(false)
      }
    }
  }

  return (
    <section>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void handleAsk()
        }}
      >
        <label>
          Ask memory workspace
          <input value={question} onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <fieldset>
          <legend>Compare options</legend>
          <fieldset>
            <legend>Compare targets</legend>
            <label>
              <input
                type="checkbox"
                checked={compareTargetControls.localBaselineEnabled}
                onChange={(event) => setCompareTargetControls((current) => ({
                  ...current,
                  localBaselineEnabled: event.target.checked
                }))}
              />
              Include local baseline
            </label>
            <label>
              <input
                type="checkbox"
                checked={compareTargetControls.siliconflowEnabled}
                onChange={(event) => setCompareTargetControls((current) => ({
                  ...current,
                  siliconflowEnabled: event.target.checked
                }))}
              />
              Include SiliconFlow target
            </label>
            <label>
              SiliconFlow model
              <input
                value={compareTargetControls.siliconflowModel}
                disabled={!compareTargetControls.siliconflowEnabled}
                onChange={(event) => setCompareTargetControls((current) => ({
                  ...current,
                  siliconflowModel: event.target.value
                }))}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={compareTargetControls.openrouterEnabled}
                onChange={(event) => setCompareTargetControls((current) => ({
                  ...current,
                  openrouterEnabled: event.target.checked
                }))}
              />
              Include OpenRouter target
            </label>
            <label>
              OpenRouter model
              <input
                value={compareTargetControls.openrouterModel}
                disabled={!compareTargetControls.openrouterEnabled}
                onChange={(event) => setCompareTargetControls((current) => ({
                  ...current,
                  openrouterModel: event.target.value
                }))}
              />
            </label>
            {selectedCompareTargets.length === 0 ? (
              <p>Select at least one compare target.</p>
            ) : null}
          </fieldset>
          <label>
            <input
              type="checkbox"
              checked={compareJudgeEnabled}
              onChange={(event) => setCompareJudgeEnabled(event.target.checked)}
            />
            Enable judge review
          </label>
          {compareJudgeEnabled ? (
            <>
              <label>
                Judge provider
                <select
                  value={compareJudgeProvider}
                  onChange={(event) => setCompareJudgeProvider(event.target.value === 'openrouter' ? 'openrouter' : 'siliconflow')}
                >
                  <option value="siliconflow">siliconflow</option>
                  <option value="openrouter">openrouter</option>
                </select>
              </label>
              <label>
                Judge model override
                <input value={compareJudgeModel} onChange={(event) => setCompareJudgeModel(event.target.value)} />
              </label>
            </>
          ) : null}
        </fieldset>
        <button type="submit" disabled={question.trim().length === 0 || isLoading}>
          Ask
        </button>
        <button
          type="button"
          disabled={!selectedCompareSummary || compareRuns.length === 0}
          onClick={handleUseSelectedCompareSetup}
        >
          Use selected compare setup
        </button>
        <button
          type="button"
          disabled={question.trim().length === 0 || isComparing || selectedCompareTargets.length === 0}
          onClick={() => { void handleRunCompare() }}
        >
          Run compare
        </button>
      </form>

      <MemoryWorkspaceView
        scope={props.scope}
        sessionSummaries={sessionSummaries}
        selectedSessionId={selectedSessionId}
        turns={turns}
        compareSessionSummaries={compareSessionSummaries}
        selectedCompareSessionId={selectedCompareSessionId}
        compareRuns={compareRuns}
        hasLoadedSessions={hasLoadedSessions}
        hasLoadedCompareSessions={hasLoadedCompareSessions}
        isLoading={isLoading}
        isLoadingSessions={isLoadingSessions}
        isComparing={isComparing}
        isLoadingCompareSessions={isLoadingCompareSessions}
        emptyStateMessage={emptyStateMessage}
        compareEmptyStateMessage={compareEmptyStateMessage}
        onSelectSession={handleSelectSession}
        onSelectCompareSession={handleSelectCompareSession}
        onStartNewSession={handleStartNewSession}
        onOpenPerson={props.onOpenPerson}
        onOpenGroup={props.onOpenGroup}
        onOpenEvidenceFile={props.onOpenEvidenceFile}
        onOpenReviewHistory={props.onOpenReviewHistory}
      />
    </section>
  )
}
