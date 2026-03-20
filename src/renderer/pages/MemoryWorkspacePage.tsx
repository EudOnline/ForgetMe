import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ApprovedDraftHostedShareHostStatus,
  ApprovedDraftSendDestination,
  ApprovedPersonaDraftHandoffRecord,
  ApprovedPersonaDraftHostedShareLinkRecord,
  ApprovedPersonaDraftPublicationRecord,
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
  PublishApprovedPersonaDraftResult,
  RunMemoryWorkspaceCompareJudgeInput
} from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { MemoryWorkspaceView } from '../components/MemoryWorkspaceView'

const compareJudgeDefaultsStorageKey = 'forgetme.memoryWorkspace.compareJudgeDefaults'
const compareTargetDefaultsStorageKey = 'forgetme.memoryWorkspace.compareTargetDefaults'
const approvedDraftPublicationDestinationStorageKey = 'forgetme.memoryWorkspace.approvedDraftPublicationDestination'
const approvedDraftSendDestinationStorageKey = 'forgetme.memoryWorkspace.approvedDraftSendDestinationId'
const DEFAULT_APPROVED_DRAFT_SEND_POLL_INTERVAL_MS = 5_000
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

type ApprovedDraftPublicationOpenStatus = {
  kind: 'success' | 'error'
  message: string
}

type ApprovedDraftHostedShareStatus = {
  kind: 'success' | 'error'
  message: string
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function approvedDraftProviderSendPollIntervalMs() {
  return parsePositiveInteger(
    process.env.FORGETME_APPROVED_DRAFT_SEND_POLL_INTERVAL_MS,
    DEFAULT_APPROVED_DRAFT_SEND_POLL_INTERVAL_MS
  )
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

function readStoredApprovedDraftPublicationDestination() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(approvedDraftPublicationDestinationStorageKey)
    return rawValue && rawValue.trim().length > 0 ? rawValue : null
  } catch {
    return null
  }
}

function writeStoredApprovedDraftPublicationDestination(destinationRoot: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (destinationRoot) {
      window.localStorage.setItem(approvedDraftPublicationDestinationStorageKey, destinationRoot)
      return
    }

    window.localStorage.removeItem(approvedDraftPublicationDestinationStorageKey)
  } catch {
    return
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
    siliconflowModel: (
      siliconflowRun?.target.executionMode === 'provider_model'
        ? siliconflowRun.target.model
        : siliconflowRun?.model
    ) ?? defaults.siliconflowModel,
    openrouterEnabled: Boolean(openrouterRun),
    openrouterModel: (
      openrouterRun?.target.executionMode === 'provider_model'
        ? openrouterRun.target.model
        : openrouterRun?.model
    ) ?? defaults.openrouterModel
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
  const selectApprovedDraftPublicationDestination = useMemo(
    () => (typeof archiveApi.selectApprovedDraftPublicationDestination === 'function'
      ? archiveApi.selectApprovedDraftPublicationDestination.bind(archiveApi)
      : async () => null as string | null),
    [archiveApi]
  )
  const listApprovedPersonaDraftPublications = useMemo(
    () => (typeof archiveApi.listApprovedPersonaDraftPublications === 'function'
      ? archiveApi.listApprovedPersonaDraftPublications.bind(archiveApi)
      : async () => [] as ApprovedPersonaDraftPublicationRecord[]),
    [archiveApi]
  )
  const publishApprovedPersonaDraft = useMemo(
    () => (typeof archiveApi.publishApprovedPersonaDraft === 'function'
      ? archiveApi.publishApprovedPersonaDraft.bind(archiveApi)
      : async () => null as PublishApprovedPersonaDraftResult | null),
    [archiveApi]
  )
  const openApprovedDraftPublicationEntry = useMemo(
    () => (typeof archiveApi.openApprovedDraftPublicationEntry === 'function'
      ? archiveApi.openApprovedDraftPublicationEntry.bind(archiveApi)
      : async (input: { entryPath: string }) => ({
          status: 'failed' as const,
          entryPath: input.entryPath,
          errorMessage: 'archive api unavailable'
        })),
    [archiveApi]
  )
  const getApprovedDraftHostedShareHostStatus = useMemo(
    () => (typeof archiveApi.getApprovedDraftHostedShareHostStatus === 'function'
      ? archiveApi.getApprovedDraftHostedShareHostStatus.bind(archiveApi)
      : async () => ({
          availability: 'unconfigured' as const,
          hostKind: null,
          hostLabel: null
        })),
    [archiveApi]
  )
  const listApprovedPersonaDraftHostedShareLinks = useMemo(
    () => (typeof archiveApi.listApprovedPersonaDraftHostedShareLinks === 'function'
      ? archiveApi.listApprovedPersonaDraftHostedShareLinks.bind(archiveApi)
      : async () => [] as ApprovedPersonaDraftHostedShareLinkRecord[]),
    [archiveApi]
  )
  const createApprovedPersonaDraftHostedShareLink = useMemo(
    () => (typeof archiveApi.createApprovedPersonaDraftHostedShareLink === 'function'
      ? archiveApi.createApprovedPersonaDraftHostedShareLink.bind(archiveApi)
      : async () => null),
    [archiveApi]
  )
  const revokeApprovedPersonaDraftHostedShareLink = useMemo(
    () => (typeof archiveApi.revokeApprovedPersonaDraftHostedShareLink === 'function'
      ? archiveApi.revokeApprovedPersonaDraftHostedShareLink.bind(archiveApi)
      : async () => null),
    [archiveApi]
  )
  const openApprovedDraftHostedShareLink = useMemo(
    () => (typeof archiveApi.openApprovedDraftHostedShareLink === 'function'
      ? archiveApi.openApprovedDraftHostedShareLink.bind(archiveApi)
      : async (input: { shareUrl: string }) => ({
          status: 'failed' as const,
          shareUrl: input.shareUrl,
          errorMessage: 'archive api unavailable'
        })),
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
  const retryApprovedPersonaDraftProviderSend = useMemo(
    () => (typeof archiveApi.retryApprovedPersonaDraftProviderSend === 'function'
      ? archiveApi.retryApprovedPersonaDraftProviderSend.bind(archiveApi)
      : async () => null),
    [archiveApi]
  )
  const scopeIdentity = scopeKey(props.scope)
  const scopeRequestRef = useRef(0)
  const [isSessionReplayMode, setIsSessionReplayMode] = useState(false)
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
  const [approvedDraftPublicationDestination, setApprovedDraftPublicationDestination] = useState<string | null>(
    () => readStoredApprovedDraftPublicationDestination()
  )
  const [approvedDraftSendDestinations, setApprovedDraftSendDestinations] = useState<ApprovedDraftSendDestination[]>([])
  const [approvedDraftSendDestinationId, setApprovedDraftSendDestinationId] = useState<string | null>(
    () => readStoredApprovedDraftSendDestinationId()
  )
  const [approvedDraftHostedShareHostStatus, setApprovedDraftHostedShareHostStatus] = useState<ApprovedDraftHostedShareHostStatus | null>(null)
  const [approvedDraftHandoffsByTurnId, setApprovedDraftHandoffsByTurnId] = useState<Record<string, ApprovedPersonaDraftHandoffRecord[]>>({})
  const [approvedDraftPublicationsByTurnId, setApprovedDraftPublicationsByTurnId] = useState<
    Record<string, ApprovedPersonaDraftPublicationRecord[]>
  >({})
  const [approvedDraftHostedShareLinksByTurnId, setApprovedDraftHostedShareLinksByTurnId] = useState<
    Record<string, ApprovedPersonaDraftHostedShareLinkRecord[]>
  >({})
  const [approvedDraftPublicationOpenStatusByTurnId, setApprovedDraftPublicationOpenStatusByTurnId] = useState<
    Record<string, ApprovedDraftPublicationOpenStatus | null>
  >({})
  const [approvedDraftHostedShareStatusByTurnId, setApprovedDraftHostedShareStatusByTurnId] = useState<
    Record<string, ApprovedDraftHostedShareStatus | null>
  >({})
  const [approvedDraftHandoffPendingByTurnId, setApprovedDraftHandoffPendingByTurnId] = useState<Record<string, boolean>>({})
  const [approvedDraftPublicationPendingByTurnId, setApprovedDraftPublicationPendingByTurnId] = useState<
    Record<string, boolean>
  >({})
  const [approvedDraftHostedSharePendingByTurnId, setApprovedDraftHostedSharePendingByTurnId] = useState<Record<string, boolean>>({})
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

  const syncApprovedDraftPublicationState = (
    turnId: string,
    publications: ApprovedPersonaDraftPublicationRecord[]
  ) => {
    setApprovedDraftPublicationsByTurnId((previousState) => ({
      ...previousState,
      [turnId]: publications
    }))
    setApprovedDraftPublicationOpenStatusByTurnId((previousState) => ({
      ...previousState,
      [turnId]: null
    }))
  }

  const syncApprovedDraftHostedShareState = (
    turnId: string,
    links: ApprovedPersonaDraftHostedShareLinkRecord[]
  ) => {
    setApprovedDraftHostedShareLinksByTurnId((previousState) => ({
      ...previousState,
      [turnId]: links
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

  const refreshApprovedDraftPublicationsForTurn = async (
    turn: MemoryWorkspaceTurnRecord,
    review: MemoryWorkspacePersonaDraftReviewRecord | null,
    scopeRequestId: number
  ) => {
    if (!review || review.status !== 'approved') {
      syncApprovedDraftPublicationState(turn.turnId, [])
      return []
    }

    const publications = await listApprovedPersonaDraftPublications({
      draftReviewId: review.draftReviewId
    })
    if (scopeRequestId !== scopeRequestRef.current) {
      return []
    }

    syncApprovedDraftPublicationState(turn.turnId, publications)
    return publications
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

  const refreshApprovedDraftHostedShareLinksForTurn = async (
    turn: MemoryWorkspaceTurnRecord,
    review: MemoryWorkspacePersonaDraftReviewRecord | null,
    scopeRequestId: number
  ) => {
    if (!review || review.status !== 'approved') {
      syncApprovedDraftHostedShareState(turn.turnId, [])
      return []
    }

    const links = await listApprovedPersonaDraftHostedShareLinks({
      draftReviewId: review.draftReviewId
    })
    if (scopeRequestId !== scopeRequestRef.current) {
      return []
    }

    syncApprovedDraftHostedShareState(turn.turnId, links)
    return links
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
    await refreshApprovedDraftPublicationsForTurn(turn, review, scopeRequestId)
    await refreshApprovedDraftHostedShareLinksForTurn(turn, review, scopeRequestId)
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
    replayMode?: boolean
  }) => {
    const scopeRequestId = options?.scopeRequestId ?? scopeRequestRef.current
    const preferredSessionId = options?.preferredSessionId ?? null
    const preserveTurns = options?.preserveTurns ?? false
    const replayMode = options?.replayMode ?? true
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
        setIsSessionReplayMode(false)
      }
      return
    }

    setSelectedSessionId(nextSessionId)
    setIsSessionReplayMode(replayMode)
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
    setIsSessionReplayMode(false)
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
    setApprovedDraftPublicationDestination(readStoredApprovedDraftPublicationDestination())
    setApprovedDraftSendDestinations([])
    setApprovedDraftSendDestinationId(readStoredApprovedDraftSendDestinationId())
    setApprovedDraftHostedShareHostStatus(null)
    setApprovedDraftHandoffsByTurnId({})
    setApprovedDraftPublicationsByTurnId({})
    setApprovedDraftHostedShareLinksByTurnId({})
    setApprovedDraftPublicationOpenStatusByTurnId({})
    setApprovedDraftHostedShareStatusByTurnId({})
    setApprovedDraftHandoffPendingByTurnId({})
    setApprovedDraftPublicationPendingByTurnId({})
    setApprovedDraftHostedSharePendingByTurnId({})
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

    void getApprovedDraftHostedShareHostStatus()
      .then((status) => {
        if (scopeRequestId !== scopeRequestRef.current) {
          return
        }

        setApprovedDraftHostedShareHostStatus(status)
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
    writeStoredApprovedDraftPublicationDestination(approvedDraftPublicationDestination)
  }, [approvedDraftPublicationDestination])

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
      setApprovedDraftPublicationsByTurnId({})
      setApprovedDraftPublicationPendingByTurnId({})
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
          await listApprovedPersonaDraftPublications({
            draftReviewId: review.draftReviewId
          })
        ] as const
      })
    ).then((entries) => {
      if (scopeRequestId !== scopeRequestRef.current) {
        return
      }

      setApprovedDraftPublicationsByTurnId(
        Object.fromEntries(entries) as Record<string, ApprovedPersonaDraftPublicationRecord[]>
      )
      setApprovedDraftPublicationPendingByTurnId((previousState) => {
        const nextPending: Record<string, boolean> = {}
        for (const turn of sandboxTurns) {
          nextPending[turn.turnId] = previousState[turn.turnId] ?? false
        }
        return nextPending
      })
    })
  }, [draftReviewsByTurnId, listApprovedPersonaDraftPublications, turns])

  useEffect(() => {
    const sandboxTurns = turns.filter(isSandboxDraftTurn)
    if (sandboxTurns.length === 0) {
      setApprovedDraftHostedShareLinksByTurnId({})
      setApprovedDraftHostedShareStatusByTurnId({})
      setApprovedDraftHostedSharePendingByTurnId({})
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
          await listApprovedPersonaDraftHostedShareLinks({
            draftReviewId: review.draftReviewId
          })
        ] as const
      })
    ).then((entries) => {
      if (scopeRequestId !== scopeRequestRef.current) {
        return
      }

      setApprovedDraftHostedShareLinksByTurnId(
        Object.fromEntries(entries) as Record<string, ApprovedPersonaDraftHostedShareLinkRecord[]>
      )
      setApprovedDraftHostedSharePendingByTurnId((previousState) => {
        const nextPending: Record<string, boolean> = {}
        for (const turn of sandboxTurns) {
          nextPending[turn.turnId] = previousState[turn.turnId] ?? false
        }
        return nextPending
      })
      setApprovedDraftHostedShareStatusByTurnId((previousState) => {
        const nextStatus: Record<string, ApprovedDraftHostedShareStatus | null> = {}
        for (const turn of sandboxTurns) {
          nextStatus[turn.turnId] = previousState[turn.turnId] ?? null
        }
        return nextStatus
      })
    })
  }, [draftReviewsByTurnId, listApprovedPersonaDraftHostedShareLinks, turns])

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

  useEffect(() => {
    const approvedSandboxTurns = turns.filter((turn) => {
      if (!isSandboxDraftTurn(turn)) {
        return false
      }

      const review = draftReviewsByTurnId[turn.turnId]
      return review?.status === 'approved'
    })

    if (approvedSandboxTurns.length === 0) {
      return
    }

    const interval = window.setInterval(() => {
      const scopeRequestId = scopeRequestRef.current

      void Promise.all(
        approvedSandboxTurns.map(async (turn) => {
          const review = draftReviewsByTurnId[turn.turnId]
          if (!review || review.status !== 'approved') {
            return
          }

          await refreshApprovedDraftProviderSendsForTurn(turn, review, scopeRequestId)
        })
      )
    }, approvedDraftProviderSendPollIntervalMs())

    return () => {
      window.clearInterval(interval)
    }
  }, [draftReviewsByTurnId, listApprovedPersonaDraftProviderSends, turns])

  const handleSelectSession = async (sessionId: string) => {
    const scopeRequestId = scopeRequestRef.current
    setSelectedSessionId(sessionId)
    setIsSessionReplayMode(true)
    setEmptyStateMessage(null)
    setIsLoadingSessions(true)

    await loadSessionDetail(sessionId, scopeRequestId)

    if (scopeRequestId === scopeRequestRef.current) {
      setIsLoadingSessions(false)
    }
  }

  const handleStartNewSession = () => {
    setSelectedSessionId(null)
    setIsSessionReplayMode(false)
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
      setIsSessionReplayMode(false)
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
        preserveTurns: true,
        replayMode: false
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

  const handleChooseApprovedDraftPublicationDestination = async () => {
    const selected = await selectApprovedDraftPublicationDestination()
    if (selected) {
      setApprovedDraftPublicationDestination(selected)
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

  const handlePublishApprovedDraft = async (turnId: string) => {
    const turn = turnsById.get(turnId)
    const review = draftReviewsByTurnId[turnId]
    if (!turn || !review || review.status !== 'approved') {
      return
    }

    let destinationRoot = approvedDraftPublicationDestination
    if (!destinationRoot) {
      destinationRoot = await selectApprovedDraftPublicationDestination()
      if (!destinationRoot) {
        return
      }
      setApprovedDraftPublicationDestination(destinationRoot)
    }

    const scopeRequestId = scopeRequestRef.current
    setApprovedDraftPublicationPendingByTurnId((previousState) => ({
      ...previousState,
      [turnId]: true
    }))

    try {
      const published = await publishApprovedPersonaDraft({
        draftReviewId: review.draftReviewId,
        destinationRoot
      })
      if (!published || scopeRequestId !== scopeRequestRef.current) {
        return
      }

      await refreshApprovedDraftPublicationsForTurn(turn, review, scopeRequestId)
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setApprovedDraftPublicationPendingByTurnId((previousState) => ({
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
      try {
        const sent = await sendApprovedPersonaDraftToProvider({
          draftReviewId: review.draftReviewId,
          ...(approvedDraftSendDestinationId ? { destinationId: approvedDraftSendDestinationId } : {})
        })
        if (!sent || scopeRequestId !== scopeRequestRef.current) {
          return
        }
      } finally {
        if (scopeRequestId === scopeRequestRef.current) {
          await refreshApprovedDraftProviderSendsForTurn(turn, review, scopeRequestId)
        }
      }
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setApprovedDraftProviderSendPendingByTurnId((previousState) => ({
          ...previousState,
          [turnId]: false
        }))
      }
    }
  }

  const handleOpenApprovedDraftPublication = async (turnId: string) => {
    const latestPublication = [...(approvedDraftPublicationsByTurnId[turnId] ?? [])]
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))[0] ?? null
    if (!latestPublication) {
      return
    }

    setApprovedDraftPublicationOpenStatusByTurnId((previousState) => ({
      ...previousState,
      [turnId]: null
    }))

    try {
      const result = await openApprovedDraftPublicationEntry({
        entryPath: latestPublication.displayEntryPath
      })
      const nextStatus: ApprovedDraftPublicationOpenStatus = result.status === 'opened'
        ? {
            kind: 'success',
            message: 'Share page opened.'
          }
        : {
            kind: 'error',
            message: `Unable to open share page: ${result.errorMessage ?? 'Unknown error.'}`
          }

      setApprovedDraftPublicationOpenStatusByTurnId((previousState) => ({
        ...previousState,
        [turnId]: nextStatus
      }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setApprovedDraftPublicationOpenStatusByTurnId((previousState) => ({
        ...previousState,
        [turnId]: {
          kind: 'error',
          message: `Unable to open share page: ${errorMessage}`
        }
      }))
    }
  }

  const handleRetryApprovedDraftSend = async (turnId: string) => {
    const turn = turnsById.get(turnId)
    const review = draftReviewsByTurnId[turnId]
    const latestSend = approvedDraftProviderSendsByTurnId[turnId]?.[0] ?? null
    const latestEvent = latestSend?.events[latestSend.events.length - 1] ?? null
    if (!turn || !review || review.status !== 'approved' || !latestSend || latestEvent?.eventType !== 'error') {
      return
    }

    const scopeRequestId = scopeRequestRef.current
    setApprovedDraftProviderSendPendingByTurnId((previousState) => ({
      ...previousState,
      [turnId]: true
    }))

    try {
      try {
        const retried = await retryApprovedPersonaDraftProviderSend({
          artifactId: latestSend.artifactId
        })
        if (!retried || scopeRequestId !== scopeRequestRef.current) {
          return
        }
      } finally {
        if (scopeRequestId === scopeRequestRef.current) {
          await refreshApprovedDraftProviderSendsForTurn(turn, review, scopeRequestId)
        }
      }
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setApprovedDraftProviderSendPendingByTurnId((previousState) => ({
          ...previousState,
          [turnId]: false
        }))
      }
    }
  }

  const handleCreateApprovedDraftHostedShareLink = async (turnId: string) => {
    const turn = turnsById.get(turnId)
    const review = draftReviewsByTurnId[turnId]
    if (!turn || !review || review.status !== 'approved') {
      return
    }

    const scopeRequestId = scopeRequestRef.current
    setApprovedDraftHostedShareStatusByTurnId((previousState) => ({
      ...previousState,
      [turnId]: null
    }))
    setApprovedDraftHostedSharePendingByTurnId((previousState) => ({
      ...previousState,
      [turnId]: true
    }))

    try {
      const created = await createApprovedPersonaDraftHostedShareLink({
        draftReviewId: review.draftReviewId
      })
      if (!created || scopeRequestId !== scopeRequestRef.current) {
        return
      }

      await refreshApprovedDraftHostedShareLinksForTurn(turn, review, scopeRequestId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (scopeRequestId === scopeRequestRef.current) {
        setApprovedDraftHostedShareStatusByTurnId((previousState) => ({
          ...previousState,
          [turnId]: {
            kind: 'error',
            message: `Unable to create hosted share link: ${errorMessage}`
          }
        }))
      }
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setApprovedDraftHostedSharePendingByTurnId((previousState) => ({
          ...previousState,
          [turnId]: false
        }))
      }
    }
  }

  const handleOpenApprovedDraftHostedShareLink = async (turnId: string) => {
    const latestLink = [...(approvedDraftHostedShareLinksByTurnId[turnId] ?? [])]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
    if (!latestLink) {
      return
    }

    setApprovedDraftHostedShareStatusByTurnId((previousState) => ({
      ...previousState,
      [turnId]: null
    }))

    try {
      const result = await openApprovedDraftHostedShareLink({
        shareUrl: latestLink.shareUrl
      })
      const nextStatus: ApprovedDraftHostedShareStatus = result.status === 'opened'
        ? {
            kind: 'success',
            message: 'Hosted share link opened.'
          }
        : {
            kind: 'error',
            message: `Unable to open hosted share link: ${result.errorMessage ?? 'Unknown error.'}`
          }

      setApprovedDraftHostedShareStatusByTurnId((previousState) => ({
        ...previousState,
        [turnId]: nextStatus
      }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setApprovedDraftHostedShareStatusByTurnId((previousState) => ({
        ...previousState,
        [turnId]: {
          kind: 'error',
          message: `Unable to open hosted share link: ${errorMessage}`
        }
      }))
    }
  }

  const handleRevokeApprovedDraftHostedShareLink = async (turnId: string) => {
    const turn = turnsById.get(turnId)
    const review = draftReviewsByTurnId[turnId]
    const latestLink = [...(approvedDraftHostedShareLinksByTurnId[turnId] ?? [])]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
    if (!turn || !review || review.status !== 'approved' || !latestLink || latestLink.status !== 'active') {
      return
    }

    const scopeRequestId = scopeRequestRef.current
    setApprovedDraftHostedShareStatusByTurnId((previousState) => ({
      ...previousState,
      [turnId]: null
    }))
    setApprovedDraftHostedSharePendingByTurnId((previousState) => ({
      ...previousState,
      [turnId]: true
    }))

    try {
      const revoked = await revokeApprovedPersonaDraftHostedShareLink({
        shareLinkId: latestLink.shareLinkId
      })
      if (!revoked || scopeRequestId !== scopeRequestRef.current) {
        return
      }

      await refreshApprovedDraftHostedShareLinksForTurn(turn, review, scopeRequestId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (scopeRequestId === scopeRequestRef.current) {
        setApprovedDraftHostedShareStatusByTurnId((previousState) => ({
          ...previousState,
          [turnId]: {
            kind: 'error',
            message: `Unable to revoke hosted share link: ${errorMessage}`
          }
        }))
      }
    } finally {
      if (scopeRequestId === scopeRequestRef.current) {
        setApprovedDraftHostedSharePendingByTurnId((previousState) => ({
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
        isSessionReplayMode={isSessionReplayMode}
        approvedDraftHandoffDestination={approvedDraftHandoffDestination}
        approvedDraftPublicationDestination={approvedDraftPublicationDestination}
        approvedDraftSendDestinations={approvedDraftSendDestinations}
        approvedDraftSendDestinationId={approvedDraftSendDestinationId}
        approvedDraftHostedShareHostStatus={approvedDraftHostedShareHostStatus}
        approvedDraftPublicationOpenStatusByTurnId={approvedDraftPublicationOpenStatusByTurnId}
        approvedDraftHostedShareStatusByTurnId={approvedDraftHostedShareStatusByTurnId}
        approvedDraftHandoffsByTurnId={approvedDraftHandoffsByTurnId}
        approvedDraftPublicationsByTurnId={approvedDraftPublicationsByTurnId}
        approvedDraftHostedShareLinksByTurnId={approvedDraftHostedShareLinksByTurnId}
        approvedDraftHandoffPendingByTurnId={approvedDraftHandoffPendingByTurnId}
        approvedDraftPublicationPendingByTurnId={approvedDraftPublicationPendingByTurnId}
        approvedDraftHostedSharePendingByTurnId={approvedDraftHostedSharePendingByTurnId}
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
        onChooseApprovedDraftPublicationDestination={() => {
          void handleChooseApprovedDraftPublicationDestination()
        }}
        onApprovedDraftSendDestinationChange={setApprovedDraftSendDestinationId}
        onExportApprovedDraft={(turnId) => {
          void handleExportApprovedDraft(turnId)
        }}
        onPublishApprovedDraft={(turnId) => {
          void handlePublishApprovedDraft(turnId)
        }}
        onOpenApprovedDraftPublication={(turnId) => {
          void handleOpenApprovedDraftPublication(turnId)
        }}
        onCreateApprovedDraftHostedShareLink={(turnId) => {
          void handleCreateApprovedDraftHostedShareLink(turnId)
        }}
        onOpenApprovedDraftHostedShareLink={(turnId) => {
          void handleOpenApprovedDraftHostedShareLink(turnId)
        }}
        onRevokeApprovedDraftHostedShareLink={(turnId) => {
          void handleRevokeApprovedDraftHostedShareLink(turnId)
        }}
        onSendApprovedDraft={(turnId) => {
          void handleSendApprovedDraft(turnId)
        }}
        onRetryApprovedDraftSend={(turnId) => {
          void handleRetryApprovedDraftSend(turnId)
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
