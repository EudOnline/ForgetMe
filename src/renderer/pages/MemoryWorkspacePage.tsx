import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ApprovedDraftSendDestination,
  ApprovedPersonaDraftHandoffRecord,
  ApprovedPersonaDraftProviderSendArtifact,
  ExportApprovedPersonaDraftResult,
  MemoryWorkspaceCompareMatrixDetail,
  MemoryWorkspaceCompareMatrixRowInput,
  MemoryWorkspaceCompareMatrixRowRecord,
  MemoryWorkspaceCompareMatrixSummary,
  MemoryWorkspaceExpressionMode,
  MemoryWorkspaceCompareTarget,
  MemoryWorkspaceCompareRunRecord,
  MemoryWorkspaceCompareSessionSummary,
  MemoryWorkspaceCitation,
  MemoryWorkspacePersonaDraftReviewRecord,
  MemoryWorkspaceScope,
  MemoryWorkspaceSessionSummary,
  MemoryWorkspaceSuggestedAction,
  MemoryWorkspaceTurnRecord,
  MemoryWorkspaceWorkflowKind,
  RunMemoryWorkspaceCompareJudgeInput
} from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { MemoryWorkspaceView } from '../components/MemoryWorkspaceView'

const compareJudgeDefaultsStorageKey = 'forgetme.memoryWorkspace.compareJudgeDefaults'
const compareTargetDefaultsStorageKey = 'forgetme.memoryWorkspace.compareTargetDefaults'
const approvedDraftSendDestinationStorageKey = 'forgetme.memoryWorkspace.approvedDraftSendDestinationId'
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

type DraftReviewEditorState = {
  editedDraft: string
  reviewNotes: string
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

function readStoredApprovedDraftSendDestinationId() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(approvedDraftSendDestinationStorageKey)
    return rawValue && rawValue.trim().length > 0 ? rawValue : null
  } catch {
    return null
  }
}

function writeStoredApprovedDraftSendDestinationId(destinationId: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (destinationId) {
      window.localStorage.setItem(approvedDraftSendDestinationStorageKey, destinationId)
      return
    }

    window.localStorage.removeItem(approvedDraftSendDestinationStorageKey)
  } catch {
    return
  }
}

function resolveApprovedDraftSendDestinationId(destinations: ApprovedDraftSendDestination[]) {
  const storedDestinationId = readStoredApprovedDraftSendDestinationId()
  if (destinations.length === 0) {
    return storedDestinationId
  }

  if (storedDestinationId && destinations.some((destination) => destination.destinationId === storedDestinationId)) {
    return storedDestinationId
  }

  return destinations.find((destination) => destination.isDefault)?.destinationId
    ?? destinations[0]?.destinationId
    ?? null
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

function inferCompareWorkflowKind(input: {
  question: string
  turns: MemoryWorkspaceTurnRecord[]
  selectedCompareSummary: MemoryWorkspaceCompareSessionSummary | null
}) {
  const trimmedQuestion = input.question.trim()
  if (!trimmedQuestion) {
    return undefined
  }

  if (
    input.selectedCompareSummary
    && input.selectedCompareSummary.question.trim() === trimmedQuestion
    && input.selectedCompareSummary.workflowKind === 'persona_draft_sandbox'
  ) {
    return 'persona_draft_sandbox' as const
  }

  const activeTurn = input.turns[input.turns.length - 1]
  if (
    activeTurn
    && activeTurn.question.trim() === trimmedQuestion
    && activeTurn.response.workflowKind === 'persona_draft_sandbox'
  ) {
    return 'persona_draft_sandbox' as const
  }

  return undefined
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

function defaultExpressionMode(): MemoryWorkspaceExpressionMode {
  return 'grounded'
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

function parseMatrixScopeToken(token: string): MemoryWorkspaceScope | null {
  const normalizedToken = token.trim()
  if (normalizedToken === 'global') {
    return { kind: 'global' }
  }

  if (normalizedToken.startsWith('person:')) {
    const canonicalPersonId = normalizedToken.slice('person:'.length).trim()
    return canonicalPersonId ? { kind: 'person', canonicalPersonId } : null
  }

  if (normalizedToken.startsWith('group:')) {
    const anchorPersonId = normalizedToken.slice('group:'.length).trim()
    return anchorPersonId ? { kind: 'group', anchorPersonId } : null
  }

  return null
}

function parseCompareMatrixRows(input: string) {
  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return {
      rows: [] as MemoryWorkspaceCompareMatrixRowInput[],
      error: 'Add at least one matrix row before running compare.'
    }
  }

  const rows: MemoryWorkspaceCompareMatrixRowInput[] = []

  for (const [index, line] of lines.entries()) {
    const parts = line.split('|').map((part) => part.trim()).filter((part) => part.length > 0)
    if (parts.length !== 2 && parts.length !== 3) {
      return {
        rows: [] as MemoryWorkspaceCompareMatrixRowInput[],
        error: `Invalid matrix line ${index + 1}. Use "scope | question" or "label | scope | question".`
      }
    }

    const [labelOrScope, scopeOrQuestion, maybeQuestion] = parts
    const scopeToken = parts.length === 2 ? labelOrScope : scopeOrQuestion
    const question = parts.length === 2 ? scopeOrQuestion : maybeQuestion!
    const scope = parseMatrixScopeToken(scopeToken)
    if (!scope) {
      return {
        rows: [] as MemoryWorkspaceCompareMatrixRowInput[],
        error: `Invalid matrix line ${index + 1}. Use "global", "person:<id>", or "group:<id>" as the scope token.`
      }
    }

    rows.push({
      ...(parts.length === 3 ? { label: labelOrScope } : {}),
      scope,
      question
    })
  }

  return {
    rows,
    error: null as string | null
  }
}

function isSandboxDraftTurn(turn: MemoryWorkspaceTurnRecord) {
  return turn.response.workflowKind === 'persona_draft_sandbox' && turn.response.personaDraft !== null
}

function createDraftReviewEditorState(
  turn: MemoryWorkspaceTurnRecord,
  review: MemoryWorkspacePersonaDraftReviewRecord | null
): DraftReviewEditorState {
  return {
    editedDraft: review?.editedDraft ?? turn.response.personaDraft?.draft ?? '',
    reviewNotes: review?.reviewNotes ?? ''
  }
}

export function MemoryWorkspacePage(props: {
  scope: MemoryWorkspaceScope
  onOpenPerson?: (canonicalPersonId: string) => void
  onOpenGroup?: (anchorPersonId: string) => void
  onOpenEvidenceFile?: (fileId: string) => void
  onOpenReviewHistory?: (citation: MemoryWorkspaceCitation) => void
}) {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const runCompareMatrix = useMemo(
    () => (typeof archiveApi.runMemoryWorkspaceCompareMatrix === 'function'
      ? archiveApi.runMemoryWorkspaceCompareMatrix.bind(archiveApi)
      : async () => null as MemoryWorkspaceCompareMatrixDetail | null),
    [archiveApi]
  )
  const listCompareMatrices = useMemo(
    () => (typeof archiveApi.listMemoryWorkspaceCompareMatrices === 'function'
      ? archiveApi.listMemoryWorkspaceCompareMatrices.bind(archiveApi)
      : async () => [] as MemoryWorkspaceCompareMatrixSummary[]),
    [archiveApi]
  )
  const getCompareMatrix = useMemo(
    () => (typeof archiveApi.getMemoryWorkspaceCompareMatrix === 'function'
      ? archiveApi.getMemoryWorkspaceCompareMatrix.bind(archiveApi)
      : async () => null as MemoryWorkspaceCompareMatrixDetail | null),
    [archiveApi]
  )
  const getPersonaDraftReviewByTurn = useMemo(
    () => (typeof archiveApi.getPersonaDraftReviewByTurn === 'function'
      ? archiveApi.getPersonaDraftReviewByTurn.bind(archiveApi)
      : async () => null as MemoryWorkspacePersonaDraftReviewRecord | null),
    [archiveApi]
  )
  const createPersonaDraftReviewFromTurn = useMemo(
    () => (typeof archiveApi.createPersonaDraftReviewFromTurn === 'function'
      ? archiveApi.createPersonaDraftReviewFromTurn.bind(archiveApi)
      : async () => null as MemoryWorkspacePersonaDraftReviewRecord | null),
    [archiveApi]
  )
  const updatePersonaDraftReview = useMemo(
    () => (typeof archiveApi.updatePersonaDraftReview === 'function'
      ? archiveApi.updatePersonaDraftReview.bind(archiveApi)
      : async () => null as MemoryWorkspacePersonaDraftReviewRecord | null),
    [archiveApi]
  )
  const transitionPersonaDraftReview = useMemo(
    () => (typeof archiveApi.transitionPersonaDraftReview === 'function'
      ? archiveApi.transitionPersonaDraftReview.bind(archiveApi)
      : async () => null as MemoryWorkspacePersonaDraftReviewRecord | null),
    [archiveApi]
  )
  const selectPersonaDraftHandoffDestination = useMemo(
    () => (typeof archiveApi.selectPersonaDraftHandoffDestination === 'function'
      ? archiveApi.selectPersonaDraftHandoffDestination.bind(archiveApi)
      : async () => null as string | null),
    [archiveApi]
  )
  const listApprovedPersonaDraftHandoffs = useMemo(
    () => (typeof archiveApi.listApprovedPersonaDraftHandoffs === 'function'
      ? archiveApi.listApprovedPersonaDraftHandoffs.bind(archiveApi)
      : async () => [] as ApprovedPersonaDraftHandoffRecord[]),
    [archiveApi]
  )
  const exportApprovedPersonaDraft = useMemo(
    () => (typeof archiveApi.exportApprovedPersonaDraft === 'function'
      ? archiveApi.exportApprovedPersonaDraft.bind(archiveApi)
      : async () => null as ExportApprovedPersonaDraftResult | null),
    [archiveApi]
  )
  const listApprovedDraftSendDestinations = useMemo(
    () => (typeof archiveApi.listApprovedDraftSendDestinations === 'function'
      ? archiveApi.listApprovedDraftSendDestinations.bind(archiveApi)
      : async () => [] as ApprovedDraftSendDestination[]),
    [archiveApi]
  )
  const listApprovedPersonaDraftProviderSends = useMemo(
    () => (typeof archiveApi.listApprovedPersonaDraftProviderSends === 'function'
      ? archiveApi.listApprovedPersonaDraftProviderSends.bind(archiveApi)
      : async () => [] as ApprovedPersonaDraftProviderSendArtifact[]),
    [archiveApi]
  )
  const sendApprovedPersonaDraftToProvider = useMemo(
    () => (typeof archiveApi.sendApprovedPersonaDraftToProvider === 'function'
      ? archiveApi.sendApprovedPersonaDraftToProvider.bind(archiveApi)
      : async () => null),
    [archiveApi]
  )
  const scopeIdentity = scopeKey(props.scope)
  const scopeRequestRef = useRef(0)
  const [question, setQuestion] = useState(() => initialQuestionForScope(props.scope))
  const [expressionMode, setExpressionMode] = useState<MemoryWorkspaceExpressionMode>(() => defaultExpressionMode())
  const [sessionSummaries, setSessionSummaries] = useState<MemoryWorkspaceSessionSummary[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [turns, setTurns] = useState<MemoryWorkspaceTurnRecord[]>([])
  const [compareSessionSummaries, setCompareSessionSummaries] = useState<MemoryWorkspaceCompareSessionSummary[]>([])
  const [selectedCompareSessionId, setSelectedCompareSessionId] = useState<string | null>(null)
  const [compareRuns, setCompareRuns] = useState<MemoryWorkspaceCompareRunRecord[]>([])
  const [matrixTitle, setMatrixTitle] = useState('')
  const [matrixRowsInput, setMatrixRowsInput] = useState('')
  const [matrixSummaries, setMatrixSummaries] = useState<MemoryWorkspaceCompareMatrixSummary[]>([])
  const [selectedMatrixSessionId, setSelectedMatrixSessionId] = useState<string | null>(null)
  const [matrixRows, setMatrixRows] = useState<MemoryWorkspaceCompareMatrixRowRecord[]>([])
  const [hasLoadedMatrices, setHasLoadedMatrices] = useState(false)
  const [hasLoadedSessions, setHasLoadedSessions] = useState(false)
  const [hasLoadedCompareSessions, setHasLoadedCompareSessions] = useState(false)
  const [isLoadingMatrices, setIsLoadingMatrices] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [isLoadingCompareSessions, setIsLoadingCompareSessions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isComparing, setIsComparing] = useState(false)
  const [isRunningMatrix, setIsRunningMatrix] = useState(false)
  const [emptyStateMessage, setEmptyStateMessage] = useState<string | null>(null)
  const [compareEmptyStateMessage, setCompareEmptyStateMessage] = useState<string | null>(null)
  const [matrixError, setMatrixError] = useState<string | null>(null)
  const [draftReviewsByTurnId, setDraftReviewsByTurnId] = useState<Record<string, MemoryWorkspacePersonaDraftReviewRecord | null>>({})
  const [draftReviewEditorsByTurnId, setDraftReviewEditorsByTurnId] = useState<Record<string, DraftReviewEditorState>>({})
  const [draftReviewPendingByTurnId, setDraftReviewPendingByTurnId] = useState<Record<string, boolean>>({})
  const [approvedDraftHandoffDestination, setApprovedDraftHandoffDestination] = useState<string | null>(null)
  const [approvedDraftSendDestinations, setApprovedDraftSendDestinations] = useState<ApprovedDraftSendDestination[]>([])
  const [approvedDraftSendDestinationId, setApprovedDraftSendDestinationId] = useState<string | null>(
    () => readStoredApprovedDraftSendDestinationId()
  )
  const [approvedDraftHandoffsByTurnId, setApprovedDraftHandoffsByTurnId] = useState<Record<string, ApprovedPersonaDraftHandoffRecord[]>>({})
  const [approvedDraftHandoffPendingByTurnId, setApprovedDraftHandoffPendingByTurnId] = useState<Record<string, boolean>>({})
  const [approvedDraftProviderSendsByTurnId, setApprovedDraftProviderSendsByTurnId] = useState<Record<string, ApprovedPersonaDraftProviderSendArtifact[]>>({})
  const [approvedDraftProviderSendPendingByTurnId, setApprovedDraftProviderSendPendingByTurnId] = useState<Record<string, boolean>>({})
  const [compareTargetControls, setCompareTargetControls] = useState<CompareTargetControls>(() => readStoredCompareTargetDefaults())
  const [compareJudgeEnabled, setCompareJudgeEnabled] = useState(() => readStoredCompareJudgeDefaults().enabled)
  const [compareJudgeProvider, setCompareJudgeProvider] = useState<NonNullable<RunMemoryWorkspaceCompareJudgeInput['provider']>>(
    () => readStoredCompareJudgeDefaults().provider
  )
  const [compareJudgeModel, setCompareJudgeModel] = useState(() => readStoredCompareJudgeDefaults().model)
  const selectedCompareSummary = compareSessionSummaries.find((summary) => summary.compareSessionId === selectedCompareSessionId) ?? null
  const selectedCompareTargets = buildCompareTargets(compareTargetControls)
  const compareUsesCustomTargets = !compareTargetControlsMatchDefaults(compareTargetControls)
  const turnsById = useMemo(() => new Map(turns.map((turn) => [turn.turnId, turn])), [turns])

  const syncDraftReviewState = (
    turn: MemoryWorkspaceTurnRecord,
    review: MemoryWorkspacePersonaDraftReviewRecord | null
  ) => {
    setDraftReviewsByTurnId((previousState) => ({
      ...previousState,
      [turn.turnId]: review
    }))
    setDraftReviewEditorsByTurnId((previousState) => ({
      ...previousState,
      [turn.turnId]: createDraftReviewEditorState(turn, review)
    }))
  }

  const syncApprovedDraftHandoffState = (
    turnId: string,
    handoffs: ApprovedPersonaDraftHandoffRecord[]
  ) => {
    setApprovedDraftHandoffsByTurnId((previousState) => ({
      ...previousState,
      [turnId]: handoffs
    }))
  }

  const syncApprovedDraftProviderSendState = (
    turnId: string,
    sends: ApprovedPersonaDraftProviderSendArtifact[]
  ) => {
    setApprovedDraftProviderSendsByTurnId((previousState) => ({
      ...previousState,
      [turnId]: sends
    }))
  }

  const refreshApprovedDraftHandoffsForTurn = async (
    turn: MemoryWorkspaceTurnRecord,
    review: MemoryWorkspacePersonaDraftReviewRecord | null,
    scopeRequestId: number
  ) => {
    if (!review || review.status !== 'approved') {
      syncApprovedDraftHandoffState(turn.turnId, [])
      return []
    }

    const handoffs = await listApprovedPersonaDraftHandoffs({
      draftReviewId: review.draftReviewId
    })
    if (scopeRequestId !== scopeRequestRef.current) {
      return []
    }

    syncApprovedDraftHandoffState(turn.turnId, handoffs)
    return handoffs
  }

  const refreshApprovedDraftProviderSendsForTurn = async (
    turn: MemoryWorkspaceTurnRecord,
    review: MemoryWorkspacePersonaDraftReviewRecord | null,
    scopeRequestId: number
  ) => {
    if (!review || review.status !== 'approved') {
      syncApprovedDraftProviderSendState(turn.turnId, [])
      return []
    }

    const sends = await listApprovedPersonaDraftProviderSends({
      draftReviewId: review.draftReviewId
    })
    if (scopeRequestId !== scopeRequestRef.current) {
      return []
    }

    syncApprovedDraftProviderSendState(turn.turnId, sends)
    return sends
  }

  const refreshDraftReviewForTurn = async (
    turn: MemoryWorkspaceTurnRecord,
    scopeRequestId: number
  ) => {
    const review = await getPersonaDraftReviewByTurn(turn.turnId)
    if (scopeRequestId !== scopeRequestRef.current) {
      return null
    }

    syncDraftReviewState(turn, review)
    await refreshApprovedDraftHandoffsForTurn(turn, review, scopeRequestId)
    await refreshApprovedDraftProviderSendsForTurn(turn, review, scopeRequestId)
    return review
  }

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

  const loadCompareMatrixDetail = async (
    matrixSessionId: string,
    scopeRequestId: number,
    preserveRows = false
  ) => {
    const matrix = await getCompareMatrix(matrixSessionId)
    if (scopeRequestId !== scopeRequestRef.current) {
      return
    }

    if (matrix) {
      setMatrixRows(matrix.rows)
      return
    }

    if (!preserveRows) {
      setMatrixRows([])
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

  const refreshCompareMatrices = async (options?: {
    scopeRequestId?: number
    preferredMatrixSessionId?: string | null
    preserveRows?: boolean
  }) => {
    const scopeRequestId = options?.scopeRequestId ?? scopeRequestRef.current
    const preferredMatrixSessionId = options?.preferredMatrixSessionId ?? null
    const preserveRows = options?.preserveRows ?? false
    const summaries = await listCompareMatrices()
    if (scopeRequestId !== scopeRequestRef.current) {
      return
    }

    setMatrixSummaries(summaries)
    setHasLoadedMatrices(true)

    const nextMatrixSessionId = preferredMatrixSessionId ?? summaries[0]?.matrixSessionId ?? null
    if (!nextMatrixSessionId) {
      if (!preserveRows) {
        setSelectedMatrixSessionId(null)
        setMatrixRows([])
      }
      return
    }

    setSelectedMatrixSessionId(nextMatrixSessionId)
    await loadCompareMatrixDetail(nextMatrixSessionId, scopeRequestId, preserveRows)
  }

  useEffect(() => {
    const scopeRequestId = scopeRequestRef.current + 1
    const storedCompareTargetDefaults = readStoredCompareTargetDefaults()
    const storedCompareJudgeDefaults = readStoredCompareJudgeDefaults()
    scopeRequestRef.current = scopeRequestId
    setQuestion(initialQuestionForScope(props.scope))
    setExpressionMode(defaultExpressionMode())
    setMatrixTitle('')
    setMatrixRowsInput('')
    setSessionSummaries([])
    setSelectedSessionId(null)
    setTurns([])
    setCompareSessionSummaries([])
    setSelectedCompareSessionId(null)
    setCompareRuns([])
    setMatrixSummaries([])
    setSelectedMatrixSessionId(null)
    setMatrixRows([])
    setHasLoadedMatrices(false)
    setHasLoadedSessions(false)
    setHasLoadedCompareSessions(false)
    setEmptyStateMessage(null)
    setCompareEmptyStateMessage(null)
    setMatrixError(null)
    setDraftReviewsByTurnId({})
    setDraftReviewEditorsByTurnId({})
    setDraftReviewPendingByTurnId({})
    setApprovedDraftHandoffDestination(null)
    setApprovedDraftSendDestinations([])
    setApprovedDraftSendDestinationId(readStoredApprovedDraftSendDestinationId())
    setApprovedDraftHandoffsByTurnId({})
    setApprovedDraftHandoffPendingByTurnId({})
    setApprovedDraftProviderSendsByTurnId({})
    setApprovedDraftProviderSendPendingByTurnId({})
    setCompareTargetControls(storedCompareTargetDefaults)
    setCompareJudgeEnabled(storedCompareJudgeDefaults.enabled)
    setCompareJudgeProvider(storedCompareJudgeDefaults.provider)
    setCompareJudgeModel(storedCompareJudgeDefaults.model)
    setIsLoadingMatrices(true)
    setIsLoadingSessions(true)
    setIsLoadingCompareSessions(true)

    void refreshCompareMatrices({ scopeRequestId })
      .finally(() => {
        if (scopeRequestId === scopeRequestRef.current) {
          setIsLoadingMatrices(false)
        }
      })

    void listApprovedDraftSendDestinations()
      .then((destinations) => {
        if (scopeRequestId !== scopeRequestRef.current) {
          return
        }

        setApprovedDraftSendDestinations(destinations)
        setApprovedDraftSendDestinationId(resolveApprovedDraftSendDestinationId(destinations))
      })

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
  }, [archiveApi, listApprovedDraftSendDestinations, props.scope, scopeIdentity])

  useEffect(() => {
    writeStoredCompareTargetDefaults(compareTargetControls)
  }, [compareTargetControls])

  useEffect(() => {
    writeStoredApprovedDraftSendDestinationId(approvedDraftSendDestinationId)
  }, [approvedDraftSendDestinationId])

  useEffect(() => {
    writeStoredCompareJudgeDefaults({
      enabled: compareJudgeEnabled,
      provider: compareJudgeProvider,
      model: compareJudgeModel
    })
  }, [compareJudgeEnabled, compareJudgeProvider, compareJudgeModel])

  useEffect(() => {
    const sandboxTurns = turns.filter(isSandboxDraftTurn)
    if (sandboxTurns.length === 0) {
      setDraftReviewsByTurnId({})
      setDraftReviewEditorsByTurnId({})
      setDraftReviewPendingByTurnId({})
      return
    }

    const scopeRequestId = scopeRequestRef.current

    void Promise.all(
      sandboxTurns.map(async (turn) => [turn.turnId, await getPersonaDraftReviewByTurn(turn.turnId)] as const)
    ).then((entries) => {
      if (scopeRequestId !== scopeRequestRef.current) {
        return
      }

      const reviewByTurnId = Object.fromEntries(entries) as Record<string, MemoryWorkspacePersonaDraftReviewRecord | null>
      const nextEditors: Record<string, DraftReviewEditorState> = {}

      for (const turn of sandboxTurns) {
        nextEditors[turn.turnId] = createDraftReviewEditorState(turn, reviewByTurnId[turn.turnId] ?? null)
      }

      setDraftReviewsByTurnId(reviewByTurnId)
      setDraftReviewEditorsByTurnId(nextEditors)
      setDraftReviewPendingByTurnId((previousState) => {
        const nextPending: Record<string, boolean> = {}
        for (const turn of sandboxTurns) {
          nextPending[turn.turnId] = previousState[turn.turnId] ?? false
        }
        return nextPending
      })
    })
  }, [getPersonaDraftReviewByTurn, turns])

  useEffect(() => {
    const sandboxTurns = turns.filter(isSandboxDraftTurn)
    if (sandboxTurns.length === 0) {
      setApprovedDraftHandoffsByTurnId({})
      setApprovedDraftHandoffPendingByTurnId({})
      return
    }

    const scopeRequestId = scopeRequestRef.current

    void Promise.all(
      sandboxTurns.map(async (turn) => {
        const review = draftReviewsByTurnId[turn.turnId]
        if (!review || review.status !== 'approved') {
          return [turn.turnId, []] as const
        }

        return [
          turn.turnId,
          await listApprovedPersonaDraftHandoffs({
            draftReviewId: review.draftReviewId
          })
        ] as const
      })
    ).then((entries) => {
      if (scopeRequestId !== scopeRequestRef.current) {
        return
      }

      setApprovedDraftHandoffsByTurnId(Object.fromEntries(entries) as Record<string, ApprovedPersonaDraftHandoffRecord[]>)
      setApprovedDraftHandoffPendingByTurnId((previousState) => {
        const nextPending: Record<string, boolean> = {}
        for (const turn of sandboxTurns) {
          nextPending[turn.turnId] = previousState[turn.turnId] ?? false
        }
        return nextPending
      })
    })
  }, [draftReviewsByTurnId, listApprovedPersonaDraftHandoffs, turns])

  useEffect(() => {
    const sandboxTurns = turns.filter(isSandboxDraftTurn)
    if (sandboxTurns.length === 0) {
      setApprovedDraftProviderSendsByTurnId({})
      setApprovedDraftProviderSendPendingByTurnId({})
      return
    }

    const scopeRequestId = scopeRequestRef.current

    void Promise.all(
      sandboxTurns.map(async (turn) => {
        const review = draftReviewsByTurnId[turn.turnId]
        if (!review || review.status !== 'approved') {
          return [turn.turnId, []] as const
        }

        return [
          turn.turnId,
          await listApprovedPersonaDraftProviderSends({
            draftReviewId: review.draftReviewId
          })
        ] as const
      })
    ).then((entries) => {
      if (scopeRequestId !== scopeRequestRef.current) {
        return
      }

      setApprovedDraftProviderSendsByTurnId(Object.fromEntries(entries) as Record<string, ApprovedPersonaDraftProviderSendArtifact[]>)
      setApprovedDraftProviderSendPendingByTurnId((previousState) => {
        const nextPending: Record<string, boolean> = {}
        for (const turn of sandboxTurns) {
          nextPending[turn.turnId] = previousState[turn.turnId] ?? false
        }
        return nextPending
      })
    })
  }, [draftReviewsByTurnId, listApprovedPersonaDraftProviderSends, turns])

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

  const handleSelectCompareMatrix = async (matrixSessionId: string) => {
    const scopeRequestId = scopeRequestRef.current
    setSelectedMatrixSessionId(matrixSessionId)
    setIsLoadingMatrices(true)

    await loadCompareMatrixDetail(matrixSessionId, scopeRequestId)

    if (scopeRequestId === scopeRequestRef.current) {
      setIsLoadingMatrices(false)
    }
  }

  const handleOpenMatrixRowCompare = async (row: MemoryWorkspaceCompareMatrixRowRecord) => {
    if (!row.compareSessionId) {
      return
    }

    await handleSelectCompareSession(row.compareSessionId)
  }

  const submitAsk = async (input: {
    question: string
    expressionMode: MemoryWorkspaceExpressionMode
    workflowKind?: MemoryWorkspaceWorkflowKind
    resetDraftQuestion?: boolean
  }) => {
    const trimmedQuestion = input.question.trim()
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
        expressionMode: input.expressionMode,
        ...(input.workflowKind ? { workflowKind: input.workflowKind } : {}),
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
      if (input.resetDraftQuestion ?? true) {
        setQuestion(initialQuestionForScope(props.scope))
      }

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

  const handleAsk = async () => {
    await submitAsk({
      question,
      expressionMode,
      resetDraftQuestion: true
    })
  }

  const handleRunSuggestedAction = async (suggestion: MemoryWorkspaceSuggestedAction) => {
    await submitAsk({
      question: suggestion.question,
      expressionMode: suggestion.expressionMode,
      workflowKind: suggestion.kind === 'open_persona_draft_sandbox' ? suggestion.workflowKind : undefined,
      resetDraftQuestion: false
    })
  }

  const handleRunCompare = async () => {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || selectedCompareTargets.length === 0) {
      return
    }

    const workflowKind = inferCompareWorkflowKind({
      question: trimmedQuestion,
      turns,
      selectedCompareSummary
    })

    const scopeRequestId = scopeRequestRef.current
    setIsComparing(true)
    setCompareEmptyStateMessage(null)

    try {
      const compareSession = await archiveApi.runMemoryWorkspaceCompare({
        scope: props.scope,
        question: trimmedQuestion,
        expressionMode,
        ...(workflowKind ? { workflowKind } : {}),
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

  const handleRunCompareMatrix = async () => {
    const { rows, error } = parseCompareMatrixRows(matrixRowsInput)
    setMatrixError(error)
    if (error) {
      return
    }

    const scopeRequestId = scopeRequestRef.current
    setIsRunningMatrix(true)

    try {
      const matrix = await runCompareMatrix({
        ...(matrixTitle.trim().length > 0 ? { title: matrixTitle.trim() } : {}),
        expressionMode,
        rows,
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

      if (!matrix) {
        setMatrixError('No compare matrix result is available yet.')
        return
      }

      setSelectedMatrixSessionId(matrix.matrixSessionId)
      setMatrixRows(matrix.rows)
      await refreshCompareMatrices({
        scopeRequestId,
        preferredMatrixSessionId: matrix.matrixSessionId,
        preserveRows: true
      })
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setIsRunningMatrix(false)
      }
    }
  }

  const handleDraftReviewEditedDraftChange = (turnId: string, value: string) => {
    const turn = turnsById.get(turnId)
    if (!turn) {
      return
    }

    setDraftReviewEditorsByTurnId((previousState) => ({
      ...previousState,
      [turnId]: {
        editedDraft: value,
        reviewNotes: previousState[turnId]?.reviewNotes ?? createDraftReviewEditorState(turn, draftReviewsByTurnId[turnId] ?? null).reviewNotes
      }
    }))
  }

  const handleDraftReviewNotesChange = (turnId: string, value: string) => {
    const turn = turnsById.get(turnId)
    if (!turn) {
      return
    }

    setDraftReviewEditorsByTurnId((previousState) => ({
      ...previousState,
      [turnId]: {
        editedDraft: previousState[turnId]?.editedDraft ?? createDraftReviewEditorState(turn, draftReviewsByTurnId[turnId] ?? null).editedDraft,
        reviewNotes: value
      }
    }))
  }

  const handleStartDraftReview = async (turnId: string) => {
    const turn = turnsById.get(turnId)
    if (!turn) {
      return
    }

    const scopeRequestId = scopeRequestRef.current
    setDraftReviewPendingByTurnId((previousState) => ({
      ...previousState,
      [turnId]: true
    }))

    try {
      const review = await createPersonaDraftReviewFromTurn(turnId)
      if (!review || scopeRequestId !== scopeRequestRef.current) {
        return
      }

      await refreshDraftReviewForTurn(turn, scopeRequestId)
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setDraftReviewPendingByTurnId((previousState) => ({
          ...previousState,
          [turnId]: false
        }))
      }
    }
  }

  const handleSaveDraftReviewEdits = async (turnId: string) => {
    const turn = turnsById.get(turnId)
    const review = draftReviewsByTurnId[turnId]
    const editorState = draftReviewEditorsByTurnId[turnId]
    if (!turn || !review || !editorState) {
      return
    }

    const scopeRequestId = scopeRequestRef.current
    setDraftReviewPendingByTurnId((previousState) => ({
      ...previousState,
      [turnId]: true
    }))

    try {
      const updatedReview = await updatePersonaDraftReview({
        draftReviewId: review.draftReviewId,
        editedDraft: editorState.editedDraft,
        reviewNotes: editorState.reviewNotes
      })
      if (!updatedReview || scopeRequestId !== scopeRequestRef.current) {
        return
      }

      await refreshDraftReviewForTurn(turn, scopeRequestId)
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setDraftReviewPendingByTurnId((previousState) => ({
          ...previousState,
          [turnId]: false
        }))
      }
    }
  }

  const handleTransitionDraftReview = async (
    turnId: string,
    status: MemoryWorkspacePersonaDraftReviewRecord['status']
  ) => {
    const turn = turnsById.get(turnId)
    const review = draftReviewsByTurnId[turnId]
    if (!turn || !review) {
      return
    }

    const scopeRequestId = scopeRequestRef.current
    setDraftReviewPendingByTurnId((previousState) => ({
      ...previousState,
      [turnId]: true
    }))

    try {
      const transitionedReview = await transitionPersonaDraftReview({
        draftReviewId: review.draftReviewId,
        status
      })
      if (!transitionedReview || scopeRequestId !== scopeRequestRef.current) {
        return
      }

      await refreshDraftReviewForTurn(turn, scopeRequestId)
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setDraftReviewPendingByTurnId((previousState) => ({
          ...previousState,
          [turnId]: false
        }))
      }
    }
  }

  const handleChooseApprovedDraftHandoffDestination = async () => {
    const selected = await selectPersonaDraftHandoffDestination()
    if (selected) {
      setApprovedDraftHandoffDestination(selected)
    }
  }

  const handleExportApprovedDraft = async (turnId: string) => {
    const turn = turnsById.get(turnId)
    const review = draftReviewsByTurnId[turnId]
    if (!turn || !review || review.status !== 'approved') {
      return
    }

    let destinationRoot = approvedDraftHandoffDestination
    if (!destinationRoot) {
      destinationRoot = await selectPersonaDraftHandoffDestination()
      if (!destinationRoot) {
        return
      }
      setApprovedDraftHandoffDestination(destinationRoot)
    }

    const scopeRequestId = scopeRequestRef.current
    setApprovedDraftHandoffPendingByTurnId((previousState) => ({
      ...previousState,
      [turnId]: true
    }))

    try {
      const exported = await exportApprovedPersonaDraft({
        draftReviewId: review.draftReviewId,
        destinationRoot
      })
      if (!exported || scopeRequestId !== scopeRequestRef.current) {
        return
      }

      await refreshApprovedDraftHandoffsForTurn(turn, review, scopeRequestId)
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setApprovedDraftHandoffPendingByTurnId((previousState) => ({
          ...previousState,
          [turnId]: false
        }))
      }
    }
  }

  const handleSendApprovedDraft = async (turnId: string) => {
    const turn = turnsById.get(turnId)
    const review = draftReviewsByTurnId[turnId]
    if (!turn || !review || review.status !== 'approved') {
      return
    }

    const scopeRequestId = scopeRequestRef.current
    setApprovedDraftProviderSendPendingByTurnId((previousState) => ({
      ...previousState,
      [turnId]: true
    }))

    try {
      const sent = await sendApprovedPersonaDraftToProvider({
        draftReviewId: review.draftReviewId,
        ...(approvedDraftSendDestinationId ? { destinationId: approvedDraftSendDestinationId } : {})
      })
      if (!sent || scopeRequestId !== scopeRequestRef.current) {
        return
      }

      await refreshApprovedDraftProviderSendsForTurn(turn, review, scopeRequestId)
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setApprovedDraftProviderSendPendingByTurnId((previousState) => ({
          ...previousState,
          [turnId]: false
        }))
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
        <label>
          Response mode
          <select
            value={expressionMode}
            onChange={(event) => setExpressionMode(event.target.value === 'advice' ? 'advice' : 'grounded')}
          >
            <option value="grounded">Grounded</option>
            <option value="advice">Advice</option>
          </select>
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
        <fieldset>
          <legend>Compare matrix</legend>
          <label>
            Compare matrix title
            <input value={matrixTitle} onChange={(event) => setMatrixTitle(event.target.value)} />
          </label>
          <label>
            Compare matrix rows
            <textarea value={matrixRowsInput} onChange={(event) => setMatrixRowsInput(event.target.value)} />
          </label>
          <p>Use one line per row: `scope | question` or `label | scope | question`.</p>
          {matrixError ? <p>{matrixError}</p> : null}
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
        <button
          type="button"
          disabled={matrixRowsInput.trim().length === 0 || isRunningMatrix}
          onClick={() => { void handleRunCompareMatrix() }}
        >
          Run matrix compare
        </button>
      </form>

      <MemoryWorkspaceView
        scope={props.scope}
        matrixSummaries={matrixSummaries}
        selectedMatrixSessionId={selectedMatrixSessionId}
        matrixRows={matrixRows}
        sessionSummaries={sessionSummaries}
        selectedSessionId={selectedSessionId}
        turns={turns}
        compareSessionSummaries={compareSessionSummaries}
        selectedCompareSessionId={selectedCompareSessionId}
        compareRuns={compareRuns}
        hasLoadedMatrices={hasLoadedMatrices}
        hasLoadedSessions={hasLoadedSessions}
        hasLoadedCompareSessions={hasLoadedCompareSessions}
        isLoadingMatrices={isLoadingMatrices}
        isLoading={isLoading}
        isLoadingSessions={isLoadingSessions}
        isComparing={isComparing}
        isRunningMatrix={isRunningMatrix}
        isLoadingCompareSessions={isLoadingCompareSessions}
        emptyStateMessage={emptyStateMessage}
        compareEmptyStateMessage={compareEmptyStateMessage}
        draftReviewsByTurnId={draftReviewsByTurnId}
        draftReviewEditorsByTurnId={draftReviewEditorsByTurnId}
        draftReviewPendingByTurnId={draftReviewPendingByTurnId}
        approvedDraftHandoffDestination={approvedDraftHandoffDestination}
        approvedDraftSendDestinations={approvedDraftSendDestinations}
        approvedDraftSendDestinationId={approvedDraftSendDestinationId}
        approvedDraftHandoffsByTurnId={approvedDraftHandoffsByTurnId}
        approvedDraftHandoffPendingByTurnId={approvedDraftHandoffPendingByTurnId}
        approvedDraftProviderSendsByTurnId={approvedDraftProviderSendsByTurnId}
        approvedDraftProviderSendPendingByTurnId={approvedDraftProviderSendPendingByTurnId}
        onSelectMatrixSession={handleSelectCompareMatrix}
        onOpenMatrixRowCompare={handleOpenMatrixRowCompare}
        onSelectSession={handleSelectSession}
        onSelectCompareSession={handleSelectCompareSession}
        onStartNewSession={handleStartNewSession}
        onStartDraftReview={handleStartDraftReview}
        onDraftReviewEditedDraftChange={handleDraftReviewEditedDraftChange}
        onDraftReviewNotesChange={handleDraftReviewNotesChange}
        onSaveDraftReviewEdits={handleSaveDraftReviewEdits}
        onMarkDraftReviewInReview={(turnId) => {
          void handleTransitionDraftReview(turnId, 'in_review')
        }}
        onApproveDraftReview={(turnId) => {
          void handleTransitionDraftReview(turnId, 'approved')
        }}
        onRejectDraftReview={(turnId) => {
          void handleTransitionDraftReview(turnId, 'rejected')
        }}
        onChooseApprovedDraftHandoffDestination={() => {
          void handleChooseApprovedDraftHandoffDestination()
        }}
        onApprovedDraftSendDestinationChange={setApprovedDraftSendDestinationId}
        onExportApprovedDraft={(turnId) => {
          void handleExportApprovedDraft(turnId)
        }}
        onSendApprovedDraft={(turnId) => {
          void handleSendApprovedDraft(turnId)
        }}
        onOpenPerson={props.onOpenPerson}
        onOpenGroup={props.onOpenGroup}
        onOpenEvidenceFile={props.onOpenEvidenceFile}
        onOpenReviewHistory={props.onOpenReviewHistory}
        onRunSuggestedAction={handleRunSuggestedAction}
      />
    </section>
  )
}
