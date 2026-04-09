import fs from 'node:fs'
import path from 'node:path'
import { dialog, shell } from 'electron'
import type { AppPaths } from '../../../services/appPaths'
import { openDatabase, runMigrations } from '../../../services/db'
import {
  getMemoryWorkspaceCompareMatrix,
  listMemoryWorkspaceCompareMatrices,
  runMemoryWorkspaceCompareMatrix
} from '../../../services/memoryWorkspaceCompareMatrixService'
import {
  getMemoryWorkspaceCompareSession,
  listMemoryWorkspaceCompareSessions,
  runMemoryWorkspaceCompare
} from '../../../services/memoryWorkspaceCompareService'
import { askMemoryWorkspace } from '../../../services/memoryWorkspaceService'
import {
  askMemoryWorkspacePersisted,
  getMemoryWorkspaceSession,
  listMemoryWorkspaceSessions
} from '../../../services/memoryWorkspaceSessionService'
import {
  askPersonAgentConsultationPersisted,
  getPersonAgentConsultationRuntimeState,
  getPersonAgentConsultationSession,
  listPersonAgentConsultationSessions
} from '../../../services/personAgentConsultationService'
import {
  executePersonAgentTask,
  transitionPersonAgentTask
} from '../../../services/personAgentTaskService'
import {
  getPersonAgentByCanonicalPersonId,
  getPersonAgentCapsule,
  listPersonAgentAuditEvents,
  listPersonAgentCapsuleMemoryCheckpoints,
  listPersonAgentInteractionMemories,
  listPersonAgentRefreshQueue,
  getPersonAgentTaskQueueRunnerState,
  listPersonAgentTaskRuns,
  listPersonAgentTasks
} from '../../../services/governancePersistenceService'
import { getPersonAgentFactMemorySummary } from '../../../services/personAgentFactMemoryService'
import {
  createPersonaDraftReviewFromTurn,
  getPersonaDraftReviewByTurn,
  transitionPersonaDraftReview,
  updatePersonaDraftReview
} from '../../../services/memoryWorkspaceDraftReviewService'
import {
  exportApprovedPersonaDraftToDirectory,
  listApprovedPersonaDraftHandoffs
} from '../../../services/personaDraftHandoffService'
import {
  listApprovedPersonaDraftPublications,
  publishApprovedPersonaDraftToDirectory,
  validateApprovedDraftPublicationEntryPath
} from '../../../services/approvedDraftPublicationService'
import {
  createApprovedPersonaDraftHostedShareLink,
  getApprovedDraftHostedShareHostStatus,
  listApprovedPersonaDraftHostedShareLinks,
  revokeApprovedPersonaDraftHostedShareLink
} from '../../../services/approvedDraftHostedShareLinkService'
import {
  listApprovedPersonaDraftProviderSends,
  retryApprovedPersonaDraftProviderSend,
  sendApprovedPersonaDraftToProvider
} from '../../../services/approvedDraftProviderSendService'
import { listApprovedDraftSendDestinations } from '../../../services/approvedDraftSendDestinationService'
import type {
  PersonAgentAuditEventRecord,
  PersonAgentCapsuleRecord,
  PersonAgentInspectionHighlight,
  PersonAgentInspectionRecommendations,
  PersonAgentMemorySummary,
  PersonAgentRecord,
  PersonAgentRefreshQueueRecord
} from '../../../shared/archiveContracts'

const PERSON_AGENT_TASK_QUEUE_RUNNER_STALLED_THRESHOLD_MINUTES = 15
const PERSON_AGENT_TASK_QUEUE_RUNNER_STALLED_THRESHOLD_MS =
  PERSON_AGENT_TASK_QUEUE_RUNNER_STALLED_THRESHOLD_MINUTES * 60 * 1000

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

function openArchiveDatabase(appPaths: AppPaths) {
  const db = openDatabase(databasePath(appPaths))
  runMigrations(db)
  return db
}

function buildPersonAgentMemorySummary(input: {
  canonicalPersonId: string
  factSummary: ReturnType<typeof getPersonAgentFactMemorySummary>
  interactionMemories: ReturnType<typeof listPersonAgentInteractionMemories>
}): PersonAgentMemorySummary | null {
  if (!input.factSummary && input.interactionMemories.length === 0) {
    return null
  }

  return {
    canonicalPersonId: input.canonicalPersonId,
    factSummary: input.factSummary,
    interactionMemories: input.interactionMemories
  }
}

function buildPersonAgentInspectionOverview(input: {
  state: PersonAgentRecord | null
  capsule: PersonAgentCapsuleRecord | null
  memorySummary: PersonAgentMemorySummary | null
  refreshQueue: PersonAgentRefreshQueueRecord[]
  auditEvents: PersonAgentAuditEventRecord[]
  runnerState: ReturnType<typeof getPersonAgentTaskQueueRunnerState>
  now: string
}) {
  const latestStrategyChangeEvent = input.auditEvents.find((event) => event.eventKind === 'strategy_profile_updated') ?? null
  const latestStrategyChangePayload = latestStrategyChangeEvent?.payload ?? {}
  const changedFields = Array.isArray(latestStrategyChangePayload.changedFields)
    ? latestStrategyChangePayload.changedFields.filter((value): value is string => typeof value === 'string')
    : []
  const runnerHealth = evaluatePersonAgentTaskQueueRunnerHealth({
    runnerState: input.runnerState,
    now: input.now
  })

  return {
    hasActiveAgent: input.state?.status === 'active',
    pendingRefreshCount: input.refreshQueue.filter((row) => row.status === 'pending').length,
    openConflictCount: input.memorySummary?.factSummary?.counts.conflicts ?? 0,
    coverageGapCount: input.memorySummary?.factSummary?.counts.coverageGaps ?? 0,
    interactionTopicCount: input.memorySummary?.interactionMemories.length ?? 0,
    totalQuestionCount: input.memorySummary?.interactionMemories.reduce((sum, row) => sum + row.questionCount, 0) ?? 0,
    latestRefreshRequestedAt: input.refreshQueue[0]?.requestedAt ?? null,
    latestStrategyChange: latestStrategyChangeEvent
      ? {
          createdAt: latestStrategyChangeEvent.createdAt,
          source: typeof latestStrategyChangePayload.source === 'string' ? latestStrategyChangePayload.source : null,
          changedFields
        }
      : null,
    capsuleStatus: input.capsule?.capsuleStatus ?? 'missing',
    activationSource: input.capsule?.activationSource ?? null,
    taskQueueRunner: runnerHealth
  }
}

function buildPersonAgentInspectionHighlights(input: {
  refreshQueue: PersonAgentRefreshQueueRecord[]
  auditEvents: PersonAgentAuditEventRecord[]
  memorySummary: PersonAgentMemorySummary | null
  runnerState: ReturnType<typeof getPersonAgentTaskQueueRunnerState>
  now: string
}) {
  const runnerHealth = evaluatePersonAgentTaskQueueRunnerHealth({
    runnerState: input.runnerState,
    now: input.now
  })
  const refreshHighlights = input.refreshQueue.flatMap((row) => {
    if (row.status === 'pending') {
      return [{
        kind: 'refresh_pending',
        createdAt: row.requestedAt,
        title: 'Pending refresh queued',
        summary: row.reasons.length > 0
          ? `Waiting on refresh for: ${row.reasons.join(', ')}.`
          : 'Waiting on refresh processing.',
        emphasis: 'high'
      } satisfies PersonAgentInspectionHighlight]
    }

    if (row.status === 'failed') {
      return [{
        kind: 'refresh_failed',
        createdAt: row.completedAt ?? row.updatedAt,
        title: 'Refresh failed',
        summary: row.lastError ?? 'The latest person-agent refresh failed.',
        emphasis: 'high'
      } satisfies PersonAgentInspectionHighlight]
    }

    return [] as PersonAgentInspectionHighlight[]
  })

  const strategyHighlights = input.auditEvents.flatMap((event) => {
    if (event.eventKind !== 'strategy_profile_updated') {
      return [] as PersonAgentInspectionHighlight[]
    }

    const source = typeof event.payload.source === 'string' ? event.payload.source : 'unknown source'
    const changedFields = Array.isArray(event.payload.changedFields)
      ? event.payload.changedFields.filter((value): value is string => typeof value === 'string')
      : []

    return [{
      kind: 'strategy_change',
      createdAt: event.createdAt,
      title: 'Strategy profile updated',
      summary: changedFields.length > 0
        ? `Changed ${changedFields.join(', ')} via ${source}.`
        : `Strategy updated via ${source}.`,
      emphasis: 'medium'
    } satisfies PersonAgentInspectionHighlight]
  })

  const interactionHighlights = (input.memorySummary?.interactionMemories ?? [])
    .filter((row) => row.questionCount > 0)
    .sort((left, right) => {
      const leftAt = left.lastQuestionAt ?? left.updatedAt
      const rightAt = right.lastQuestionAt ?? right.updatedAt
      return rightAt.localeCompare(leftAt)
    })
    .slice(0, 2)
    .map((row) => ({
      kind: 'interaction_hotspot',
      createdAt: row.lastQuestionAt ?? row.updatedAt,
      title: 'Recurring interaction topic',
      summary: `${row.topicLabel}: ${row.summary}`,
      emphasis: row.questionCount >= 3 ? 'high' : 'medium'
    } satisfies PersonAgentInspectionHighlight))

  const runnerHighlights = [] as PersonAgentInspectionHighlight[]
  if (runnerHealth.status === 'error') {
    runnerHighlights.push({
      kind: 'runner_error',
      createdAt: input.runnerState?.lastFailedAt ?? input.runnerState?.updatedAt ?? input.now,
      title: 'Task queue runner failed',
      summary: runnerHealth.reason ?? 'The background task queue runner reported an error.',
      emphasis: 'high'
    })
  } else if (runnerHealth.status === 'stalled') {
    runnerHighlights.push({
      kind: 'runner_stalled',
      createdAt: input.runnerState?.lastStartedAt ?? input.runnerState?.updatedAt ?? input.now,
      title: 'Task queue runner stalled',
      summary: runnerHealth.reason ?? 'The background task queue runner has not completed within the expected window.',
      emphasis: 'high'
    })
  }

  return [...refreshHighlights, ...strategyHighlights, ...interactionHighlights, ...runnerHighlights]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 6)
}

function evaluatePersonAgentTaskQueueRunnerHealth(input: {
  runnerState: ReturnType<typeof getPersonAgentTaskQueueRunnerState>
  now: string
}) {
  if (!input.runnerState) {
    return {
      status: 'missing',
      stalled: false,
      thresholdMinutes: PERSON_AGENT_TASK_QUEUE_RUNNER_STALLED_THRESHOLD_MINUTES,
      reason: 'No task queue runner state has been recorded yet.',
      lastHeartbeatAt: null,
      lastProcessedTaskCount: 0,
      totalProcessedTaskCount: 0,
      lastError: null
    } as const
  }

  const lastHeartbeatAt =
    input.runnerState.lastCompletedAt
    ?? input.runnerState.lastFailedAt
    ?? input.runnerState.lastStartedAt
    ?? input.runnerState.updatedAt

  if (input.runnerState.status === 'error') {
    return {
      status: 'error',
      stalled: false,
      thresholdMinutes: PERSON_AGENT_TASK_QUEUE_RUNNER_STALLED_THRESHOLD_MINUTES,
      reason: input.runnerState.lastError ?? 'The latest task queue runner cycle failed.',
      lastHeartbeatAt,
      lastProcessedTaskCount: input.runnerState.lastProcessedTaskCount,
      totalProcessedTaskCount: input.runnerState.totalProcessedTaskCount,
      lastError: input.runnerState.lastError
    } as const
  }

  if (input.runnerState.status === 'running' && input.runnerState.lastStartedAt) {
    const startedAt = Date.parse(input.runnerState.lastStartedAt)
    const now = Date.parse(input.now)
    if (Number.isFinite(startedAt) && Number.isFinite(now) && now - startedAt > PERSON_AGENT_TASK_QUEUE_RUNNER_STALLED_THRESHOLD_MS) {
      return {
        status: 'stalled',
        stalled: true,
        thresholdMinutes: PERSON_AGENT_TASK_QUEUE_RUNNER_STALLED_THRESHOLD_MINUTES,
        reason: `Task queue runner has been running for more than ${PERSON_AGENT_TASK_QUEUE_RUNNER_STALLED_THRESHOLD_MINUTES} minutes without a completion signal.`,
        lastHeartbeatAt: input.runnerState.lastStartedAt,
        lastProcessedTaskCount: input.runnerState.lastProcessedTaskCount,
        totalProcessedTaskCount: input.runnerState.totalProcessedTaskCount,
        lastError: input.runnerState.lastError
      } as const
    }
  }

  return {
    status: 'healthy',
    stalled: false,
    thresholdMinutes: PERSON_AGENT_TASK_QUEUE_RUNNER_STALLED_THRESHOLD_MINUTES,
    reason: null,
    lastHeartbeatAt,
    lastProcessedTaskCount: input.runnerState.lastProcessedTaskCount,
    totalProcessedTaskCount: input.runnerState.totalProcessedTaskCount,
    lastError: input.runnerState.lastError
  } as const
}

function buildPersonAgentInspectionRecommendations(input: {
  overview: ReturnType<typeof buildPersonAgentInspectionOverview>
  memorySummary: PersonAgentMemorySummary | null
}) {
  const conflictMemory = input.memorySummary?.factSummary?.conflicts[0] ?? null
  const coverageGapMemory = input.memorySummary?.factSummary?.coverageGaps[0] ?? null
  const interactionTopic = (input.memorySummary?.interactionMemories ?? [])
    .slice()
    .sort((left, right) => {
      if (right.questionCount !== left.questionCount) {
        return right.questionCount - left.questionCount
      }

      const leftAt = left.lastQuestionAt ?? left.updatedAt
      const rightAt = right.lastQuestionAt ?? right.updatedAt
      return rightAt.localeCompare(leftAt)
    })[0] ?? null

  const recommendedTopics = [] as PersonAgentInspectionRecommendations['recommendedTopics']

  if (input.overview.openConflictCount > 0) {
    recommendedTopics.push({
      kind: 'conflict',
      label: conflictMemory?.displayLabel ?? conflictMemory?.memoryKey ?? 'open_conflict',
      reason: 'Open conflict needs review after refresh completes.'
    })
  }

  if (interactionTopic) {
    recommendedTopics.push({
      kind: 'interaction_topic',
      label: interactionTopic.topicLabel,
      reason: 'Repeated questions suggest a stable follow-up topic.'
    })
  }

  if (input.overview.coverageGapCount > 0) {
    recommendedTopics.push({
      kind: 'coverage_gap',
      label: coverageGapMemory?.displayLabel ?? coverageGapMemory?.memoryKey ?? 'coverage_gap',
      reason: 'Coverage gaps mark areas where more evidence would help.'
    })
  }

  if (input.overview.latestStrategyChange) {
    recommendedTopics.push({
      kind: 'strategy_change',
      label: 'strategy_profile',
      reason: 'Recent strategy changes may affect how this person agent should be consulted.'
    })
  }

  if (input.overview.pendingRefreshCount > 0) {
    return {
      attentionLevel: 'high',
      nextBestAction: 'wait_for_refresh',
      blockingReason: 'pending_refresh',
      suggestedQuestion: '等刷新完成后，再确认 school_name 的冲突来源是什么？',
      recommendedTopics
    } satisfies PersonAgentInspectionRecommendations
  }

  if (input.overview.openConflictCount > 0) {
    return {
      attentionLevel: 'high',
      nextBestAction: 'resolve_conflict',
      blockingReason: 'open_conflict',
      suggestedQuestion: '这条冲突信息里，哪一个来源更可信？',
      recommendedTopics
    } satisfies PersonAgentInspectionRecommendations
  }

  if (input.overview.coverageGapCount > 0) {
    return {
      attentionLevel: 'medium',
      nextBestAction: 'fill_coverage_gap',
      blockingReason: 'coverage_gap',
      suggestedQuestion: '关于这个人，还有哪一类资料最值得补充？',
      recommendedTopics
    } satisfies PersonAgentInspectionRecommendations
  }

  if (interactionTopic && interactionTopic.questionCount >= 2) {
    return {
      attentionLevel: 'medium',
      nextBestAction: 'expand_topic',
      blockingReason: null,
      suggestedQuestion: `要不要继续追问 ${interactionTopic.topicLabel} 的细节？`,
      recommendedTopics
    } satisfies PersonAgentInspectionRecommendations
  }

  if (input.overview.latestStrategyChange) {
    return {
      attentionLevel: 'medium',
      nextBestAction: 'review_strategy_change',
      blockingReason: null,
      suggestedQuestion: '这次策略调整是否需要同步到前端展示方式？',
      recommendedTopics
    } satisfies PersonAgentInspectionRecommendations
  }

  return {
    attentionLevel: 'steady',
    nextBestAction: 'monitor',
    blockingReason: null,
    suggestedQuestion: null,
    recommendedTopics
  } satisfies PersonAgentInspectionRecommendations
}

async function selectDirectory(envKey: string) {
  const envValue = process.env[envKey]
  if (envValue) {
    return envValue
  }

  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })

  return result.canceled ? null : result.filePaths[0] ?? null
}

export function createWorkspaceModule(appPaths: AppPaths) {
  return {
    async withArchiveDatabase<T>(
      work: (db: ReturnType<typeof openArchiveDatabase>) => Promise<T> | T
    ) {
      const db = openArchiveDatabase(appPaths)

      try {
        return await work(db)
      } finally {
        db.close()
      }
    },
    async ask(input: Parameters<typeof askMemoryWorkspace>[1]) {
      return this.withArchiveDatabase((db) => askMemoryWorkspace(db, input))
    },
    async listSessions(input: Parameters<typeof listMemoryWorkspaceSessions>[1]) {
      return this.withArchiveDatabase((db) => listMemoryWorkspaceSessions(db, input))
    },
    async getSession(input: Parameters<typeof getMemoryWorkspaceSession>[1]) {
      return this.withArchiveDatabase((db) => getMemoryWorkspaceSession(db, input))
    },
    async askPersisted(input: Parameters<typeof askMemoryWorkspacePersisted>[1]) {
      return this.withArchiveDatabase((db) => askMemoryWorkspacePersisted(db, input))
    },
    async askPersonAgentConsultation(input: Parameters<typeof askPersonAgentConsultationPersisted>[1]) {
      return this.withArchiveDatabase((db) => askPersonAgentConsultationPersisted(db, input))
    },
    async listPersonAgentConsultationSessions(input: Parameters<typeof listPersonAgentConsultationSessions>[1] = {}) {
      return this.withArchiveDatabase((db) => listPersonAgentConsultationSessions(db, input))
    },
    async getPersonAgentConsultationSession(input: Parameters<typeof getPersonAgentConsultationSession>[1]) {
      return this.withArchiveDatabase((db) => getPersonAgentConsultationSession(db, input))
    },
    async getPersonAgentRuntimeState(input: Parameters<typeof getPersonAgentConsultationRuntimeState>[1]) {
      return this.withArchiveDatabase((db) => getPersonAgentConsultationRuntimeState(db, input))
    },
    async getPersonAgentTaskQueueRunnerState() {
      return this.withArchiveDatabase((db) => getPersonAgentTaskQueueRunnerState(db, {}))
    },
    async getPersonAgentState(input: { canonicalPersonId: string }) {
      return this.withArchiveDatabase((db) => getPersonAgentByCanonicalPersonId(db, input))
    },
    async getPersonAgentCapsule(input: {
      capsuleId?: string
      personAgentId?: string
      canonicalPersonId?: string
    }) {
      return this.withArchiveDatabase((db) => getPersonAgentCapsule(db, input))
    },
    async listPersonAgentCapsuleMemoryCheckpoints(input: {
      capsuleId?: string
      personAgentId?: string
      canonicalPersonId?: string
      limit?: number
    }) {
      return this.withArchiveDatabase((db) => listPersonAgentCapsuleMemoryCheckpoints(db, input))
    },
    async listPersonAgentRefreshQueue(input: { status?: 'pending' | 'processing' | 'completed' | 'failed' } = {}) {
      return this.withArchiveDatabase((db) => listPersonAgentRefreshQueue(db, input))
    },
    async listPersonAgentAuditEvents(input: {
      personAgentId?: string
      canonicalPersonId?: string
      eventKind?: string
    } = {}) {
      return this.withArchiveDatabase((db) => listPersonAgentAuditEvents(db, input))
    },
    async listPersonAgentTasks(input: {
      personAgentId?: string
      canonicalPersonId?: string
      status?: 'pending' | 'processing' | 'completed' | 'dismissed'
    } = {}) {
      return this.withArchiveDatabase((db) => listPersonAgentTasks(db, input))
    },
    async transitionPersonAgentTask(input: {
      taskId: string
      status: 'processing' | 'completed' | 'dismissed'
      source?: string
      reason?: string
    }) {
      return this.withArchiveDatabase((db) => transitionPersonAgentTask(db, input))
    },
    async listPersonAgentTaskRuns(input: {
      taskId?: string
      personAgentId?: string
      canonicalPersonId?: string
      taskKind?: 'await_refresh' | 'resolve_conflict' | 'fill_coverage_gap' | 'expand_topic' | 'review_strategy_change'
      runStatus?: 'completed' | 'blocked' | 'failed'
    } = {}) {
      return this.withArchiveDatabase((db) => listPersonAgentTaskRuns(db, input))
    },
    async executePersonAgentTask(input: {
      taskId: string
      source?: string
    }) {
      return this.withArchiveDatabase((db) => executePersonAgentTask(db, input))
    },
    async getPersonAgentMemorySummary(input: { canonicalPersonId: string }) {
      return this.withArchiveDatabase((db) => {
        const factSummary = getPersonAgentFactMemorySummary(db, input)
        const interactionMemories = listPersonAgentInteractionMemories(db, {
          canonicalPersonId: input.canonicalPersonId
        })
        return buildPersonAgentMemorySummary({
          canonicalPersonId: input.canonicalPersonId,
          factSummary,
          interactionMemories
        })
      })
    },
    async getPersonAgentInspectionBundle(input: { canonicalPersonId: string }) {
      return this.withArchiveDatabase((db) => {
        const now = new Date().toISOString()
        const state = getPersonAgentByCanonicalPersonId(db, input)
        const capsule = getPersonAgentCapsule(db, input)
        const capsuleCheckpoint = listPersonAgentCapsuleMemoryCheckpoints(db, {
          canonicalPersonId: input.canonicalPersonId,
          limit: 1
        })[0] ?? null
        const factSummary = getPersonAgentFactMemorySummary(db, input)
        const interactionMemories = listPersonAgentInteractionMemories(db, {
          canonicalPersonId: input.canonicalPersonId
        })
        const refreshQueue = listPersonAgentRefreshQueue(db, {
          canonicalPersonId: input.canonicalPersonId
        })
        const auditEvents = listPersonAgentAuditEvents(db, {
          canonicalPersonId: input.canonicalPersonId
        })
        const runnerState = getPersonAgentTaskQueueRunnerState(db, {})
        const tasks = listPersonAgentTasks(db, {
          canonicalPersonId: input.canonicalPersonId
        })
        const memorySummary = buildPersonAgentMemorySummary({
          canonicalPersonId: input.canonicalPersonId,
          factSummary,
          interactionMemories
        })
        const overview = buildPersonAgentInspectionOverview({
          state,
          capsule,
          memorySummary,
          refreshQueue,
          auditEvents,
          runnerState,
          now
        })

        if (
          !state
          && !capsule
          && !memorySummary
          && refreshQueue.length === 0
          && auditEvents.length === 0
          && tasks.length === 0
        ) {
          return null
        }

        return {
          canonicalPersonId: input.canonicalPersonId,
          overview,
          recommendations: buildPersonAgentInspectionRecommendations({
            overview,
            memorySummary
          }),
          highlights: buildPersonAgentInspectionHighlights({
            refreshQueue,
            auditEvents,
            memorySummary,
            runnerState,
            now
          }),
          capsule,
          capsuleCheckpoint,
          runnerState,
          tasks,
          state,
          memorySummary,
          refreshQueue,
          auditEvents
        }
      })
    },
    async runCompare(input: Parameters<typeof runMemoryWorkspaceCompare>[1]) {
      return this.withArchiveDatabase((db) => runMemoryWorkspaceCompare(db, input))
    },
    async listCompareSessions(input: Parameters<typeof listMemoryWorkspaceCompareSessions>[1]) {
      return this.withArchiveDatabase((db) => listMemoryWorkspaceCompareSessions(db, input))
    },
    async getCompareSession(input: Parameters<typeof getMemoryWorkspaceCompareSession>[1]) {
      return this.withArchiveDatabase((db) => getMemoryWorkspaceCompareSession(db, input))
    },
    async runCompareMatrix(input: Parameters<typeof runMemoryWorkspaceCompareMatrix>[1]) {
      return this.withArchiveDatabase((db) => runMemoryWorkspaceCompareMatrix(db, input))
    },
    async listCompareMatrices() {
      return this.withArchiveDatabase((db) => listMemoryWorkspaceCompareMatrices(db))
    },
    async getCompareMatrix(input: Parameters<typeof getMemoryWorkspaceCompareMatrix>[1]) {
      return this.withArchiveDatabase((db) => getMemoryWorkspaceCompareMatrix(db, input))
    },
    async getDraftReviewByTurn(input: Parameters<typeof getPersonaDraftReviewByTurn>[1]) {
      return this.withArchiveDatabase((db) => getPersonaDraftReviewByTurn(db, input))
    },
    async createDraftReviewFromTurn(input: Parameters<typeof createPersonaDraftReviewFromTurn>[1]) {
      return this.withArchiveDatabase((db) => createPersonaDraftReviewFromTurn(db, input))
    },
    async updateDraftReview(input: Parameters<typeof updatePersonaDraftReview>[1]) {
      return this.withArchiveDatabase((db) => updatePersonaDraftReview(db, input))
    },
    async transitionDraftReview(input: Parameters<typeof transitionPersonaDraftReview>[1]) {
      return this.withArchiveDatabase((db) => transitionPersonaDraftReview(db, input))
    },
    async selectDraftHandoffDestination() {
      return selectDirectory('FORGETME_E2E_PERSONA_DRAFT_HANDOFF_DESTINATION_DIR')
    },
    async listApprovedDraftHandoffs(input: Parameters<typeof listApprovedPersonaDraftHandoffs>[1]) {
      return this.withArchiveDatabase((db) => listApprovedPersonaDraftHandoffs(db, input))
    },
    async exportApprovedDraft(input: Parameters<typeof exportApprovedPersonaDraftToDirectory>[1]) {
      return this.withArchiveDatabase((db) => exportApprovedPersonaDraftToDirectory(db, input))
    },
    async selectPublicationDestination() {
      return selectDirectory('FORGETME_E2E_APPROVED_DRAFT_PUBLICATION_DESTINATION_DIR')
    },
    async listApprovedDraftPublications(input: Parameters<typeof listApprovedPersonaDraftPublications>[1]) {
      return this.withArchiveDatabase((db) => listApprovedPersonaDraftPublications(db, input))
    },
    async publishApprovedDraft(input: Parameters<typeof publishApprovedPersonaDraftToDirectory>[1]) {
      return this.withArchiveDatabase((db) => publishApprovedPersonaDraftToDirectory(db, input))
    },
    async openApprovedDraftPublicationEntry(input: { entryPath: string }) {
      const entryPath = path.normalize(input.entryPath)

      if (path.basename(entryPath) !== 'index.html') {
        return {
          status: 'failed' as const,
          entryPath,
          errorMessage: `Publication entry must be index.html: ${entryPath}`
        }
      }

      if (!fs.existsSync(entryPath)) {
        return {
          status: 'failed' as const,
          entryPath,
          errorMessage: `Publication entry file not found: ${entryPath}`
        }
      }

      const packageValidationError = validateApprovedDraftPublicationEntryPath(entryPath)
      if (packageValidationError) {
        return {
          status: 'failed' as const,
          entryPath,
          errorMessage: packageValidationError
        }
      }

      try {
        const errorMessage = await shell.openPath(entryPath)
        return errorMessage
          ? { status: 'failed' as const, entryPath, errorMessage }
          : { status: 'opened' as const, entryPath, errorMessage: null }
      } catch (error) {
        return {
          status: 'failed' as const,
          entryPath,
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      }
    },
    async getHostedShareHostStatus() {
      return getApprovedDraftHostedShareHostStatus()
    },
    async listHostedShareLinks(input: Parameters<typeof listApprovedPersonaDraftHostedShareLinks>[1]) {
      return this.withArchiveDatabase((db) => listApprovedPersonaDraftHostedShareLinks(db, input))
    },
    async createHostedShareLink(input: Parameters<typeof createApprovedPersonaDraftHostedShareLink>[1]) {
      return this.withArchiveDatabase((db) => createApprovedPersonaDraftHostedShareLink(db, input))
    },
    async revokeHostedShareLink(input: Parameters<typeof revokeApprovedPersonaDraftHostedShareLink>[1]) {
      return this.withArchiveDatabase((db) => revokeApprovedPersonaDraftHostedShareLink(db, input))
    },
    async openHostedShareLink(input: { shareUrl: string }) {
      try {
        await shell.openExternal(input.shareUrl)
        return {
          status: 'opened' as const,
          shareUrl: input.shareUrl,
          errorMessage: null
        }
      } catch (error) {
        return {
          status: 'failed' as const,
          shareUrl: input.shareUrl,
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      }
    },
    async listSendDestinations() {
      return listApprovedDraftSendDestinations()
    },
    async listProviderSends(input: Parameters<typeof listApprovedPersonaDraftProviderSends>[1]) {
      return this.withArchiveDatabase((db) => listApprovedPersonaDraftProviderSends(db, input))
    },
    async sendToProvider(input: Parameters<typeof sendApprovedPersonaDraftToProvider>[1]) {
      return this.withArchiveDatabase((db) => sendApprovedPersonaDraftToProvider(db, input))
    },
    async retryProviderSend(input: Parameters<typeof retryApprovedPersonaDraftProviderSend>[1]) {
      return this.withArchiveDatabase((db) => retryApprovedPersonaDraftProviderSend(db, input))
    }
  }
}
