import type {
  AgentArtifactRef,
  AgentObjectiveDetail,
  AgentObjectiveKind,
  AgentObjectiveStatus,
  AgentProposalKind,
} from '../../shared/objectiveRuntimeContracts'
import type { AgentRole, MemoryWorkspaceScope } from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { listEnrichmentJobs } from './enrichmentReadService'
import { listStoredMemoryWorkspaceCompareSessions } from './memoryWorkspaceComparePersistenceService'
import { listReviewConflictGroups } from './reviewWorkbenchReadService'

type TriggerProposalSeed = {
  proposedByParticipantId: string
  proposalKind: AgentProposalKind
  payload: Record<string, unknown>
  ownerRole: AgentRole
  requiredApprovals?: AgentRole[]
  allowVetoBy?: AgentRole[]
  requiresOperatorConfirmation?: boolean
  artifactRefs?: AgentArtifactRef[]
}

type ObjectiveTriggerSeed = {
  title: string
  objectiveKind: AgentObjectiveKind
  prompt: string
  dedupeKey?: string
  initialProposal: TriggerProposalSeed
}

type ObjectiveTriggerRuntime = {
  startObjective: (input: {
    title: string
    objectiveKind: AgentObjectiveKind
    prompt: string
    initiatedBy?: 'operator' | 'system'
  }) => Promise<{
    objective: {
      objectiveId: string
    }
    mainThread: {
      threadId: string
    }
  }>
  createProposal: (input: {
    objectiveId: string
    threadId: string
    proposedByParticipantId: string
    proposalKind: AgentProposalKind
    payload: Record<string, unknown>
    ownerRole: AgentRole
    requiredApprovals?: AgentRole[]
    allowVetoBy?: AgentRole[]
    requiresOperatorConfirmation?: boolean
    artifactRefs?: AgentArtifactRef[]
  }) => unknown
  listObjectives: () => Array<{
    objectiveId: string
    title: string
    status: AgentObjectiveStatus
  }>
  getObjectiveDetail: (input: { objectiveId: string }) => AgentObjectiveDetail | null
}

function isTerminalObjectiveStatus(status: AgentObjectiveStatus) {
  return status === 'completed' || status === 'cancelled'
}

function compareScopeKey(scope: MemoryWorkspaceScope) {
  if (scope.kind === 'person') {
    return `person:${scope.canonicalPersonId ?? ''}`
  }

  if (scope.kind === 'group') {
    return `group:${scope.anchorPersonId ?? ''}`
  }

  return 'global'
}

function compareRequestFamilyKey(input: {
  scope: MemoryWorkspaceScope
  question: string
  workflowKind: string
  expressionMode: string
}) {
  return [
    compareScopeKey(input.scope),
    input.workflowKind,
    input.expressionMode,
    input.question.trim()
  ].join('::')
}

function compareReviewObjectiveTitle(compareSessionId: string) {
  return `Review compare recommendation ${compareSessionId}`
}

function compareSessionIdFromReviewObjectiveTitle(title: string) {
  const prefix = 'Review compare recommendation '
  if (!title.startsWith(prefix)) {
    return null
  }

  const compareSessionId = title.slice(prefix.length).trim()
  return compareSessionId.length > 0 ? compareSessionId : null
}

function buildTriggerSeeds(db: ArchiveDatabase): ObjectiveTriggerSeed[] {
  const safeReviewGroupSeeds = listReviewConflictGroups(db)
    .filter((group) => !group.hasConflict && group.pendingCount > 1)
    .map((group) => ({
      title: `Review safe group ${group.groupKey}`,
      objectiveKind: 'review_decision' as const,
      prompt: `Apply safe group ${group.groupKey}.`,
      initialProposal: {
        proposedByParticipantId: 'review',
        proposalKind: 'approve_safe_group' as const,
        payload: {
          groupKey: group.groupKey
        },
        ownerRole: 'review' as const,
        requiredApprovals: ['review' as const],
        allowVetoBy: ['governance' as const],
        requiresOperatorConfirmation: true,
        artifactRefs: [
          {
            kind: 'review_group' as const,
            id: group.groupKey,
            label: group.fieldKey
              ? `${group.canonicalPersonName} · ${group.fieldKey}`
              : group.canonicalPersonName
          }
        ]
      }
    }))

  const failedEnrichmentSeeds = listEnrichmentJobs(db, { status: 'failed' })
    .map((job) => ({
      title: `Investigate failed enrichment job ${job.id}`,
      objectiveKind: 'evidence_investigation' as const,
      prompt: `Investigate failed enrichment job ${job.id} for file ${job.fileId} (${job.fileName}).`,
      initialProposal: {
        proposedByParticipantId: 'ingestion',
        proposalKind: 'rerun_enrichment' as const,
        payload: {
          jobId: job.id
        },
        ownerRole: 'ingestion' as const,
        requiredApprovals: ['ingestion' as const],
        allowVetoBy: ['governance' as const],
        requiresOperatorConfirmation: true,
        artifactRefs: [
          {
            kind: 'enrichment_job' as const,
            id: job.id,
            label: `${job.enhancerType} · ${job.fileName}`
          },
          {
            kind: 'file' as const,
            id: job.fileId,
            label: job.fileName
          }
        ]
      }
    }))

  const latestCompareSessionsByFamily = new Map<string, ReturnType<typeof listStoredMemoryWorkspaceCompareSessions>[number]>()

  for (const session of listStoredMemoryWorkspaceCompareSessions(db)) {
    if (
      session.recommendation?.source === 'judge_assisted'
      && session.recommendation.decision === 'recommend_run'
      && typeof session.recommendation.recommendedCompareRunId === 'string'
      && session.recommendation.recommendedCompareRunId.trim().length > 0
      && typeof session.recommendation.recommendedTargetLabel === 'string'
      && session.recommendation.recommendedTargetLabel.trim().length > 0
    ) {
      const familyKey = compareRequestFamilyKey({
        scope: session.scope,
        question: session.question,
        workflowKind: session.workflowKind,
        expressionMode: session.expressionMode
      })

      if (!latestCompareSessionsByFamily.has(familyKey)) {
        latestCompareSessionsByFamily.set(familyKey, session)
      }
    }
  }

  const compareRecommendationSeeds = Array.from(latestCompareSessionsByFamily.values())
    .map((session) => ({
      title: compareReviewObjectiveTitle(session.compareSessionId),
      objectiveKind: 'review_decision' as const,
      prompt: `Review compare recommendation for session ${session.compareSessionId} and decide whether to adopt ${session.recommendation?.recommendedTargetLabel} for "${session.question}".`,
      dedupeKey: compareRequestFamilyKey({
        scope: session.scope,
        question: session.question,
        workflowKind: session.workflowKind,
        expressionMode: session.expressionMode
      }),
      initialProposal: {
        proposedByParticipantId: 'workspace',
        proposalKind: 'adopt_compare_recommendation' as const,
        payload: {
          compareSessionId: session.compareSessionId,
          recommendedCompareRunId: session.recommendation?.recommendedCompareRunId,
          recommendedTargetLabel: session.recommendation?.recommendedTargetLabel
        },
        ownerRole: 'workspace' as const,
        requiredApprovals: ['workspace' as const],
        allowVetoBy: ['governance' as const],
        requiresOperatorConfirmation: true,
        artifactRefs: [
          {
            kind: 'compare_session' as const,
            id: session.compareSessionId,
            label: session.title
          }
        ]
      }
    }))

  return [
    ...safeReviewGroupSeeds,
    ...failedEnrichmentSeeds,
    ...compareRecommendationSeeds
  ]
}

export function createObjectiveTriggerService(input: {
  db: ArchiveDatabase
  runtime: ObjectiveTriggerRuntime
}) {
  return {
    async refreshObjectiveTriggers() {
      const existingObjectives = input.runtime.listObjectives()
      const compareSessionFamilyKeys = new Map(
        listStoredMemoryWorkspaceCompareSessions(input.db).map((session) => ([
          session.compareSessionId,
          compareRequestFamilyKey({
            scope: session.scope,
            question: session.question,
            workflowKind: session.workflowKind,
            expressionMode: session.expressionMode
          })
        ]))
      )
      const openCompareRequestFamilies = new Set(
        existingObjectives
          .filter((objective) => !isTerminalObjectiveStatus(objective.status))
          .map((objective) => compareSessionIdFromReviewObjectiveTitle(objective.title))
          .flatMap((compareSessionId) => {
            if (!compareSessionId) {
              return []
            }

            const familyKey = compareSessionFamilyKeys.get(compareSessionId)
            return familyKey ? [familyKey] : []
          })
      )
      const createdObjectives: AgentObjectiveDetail[] = []

      for (const seed of buildTriggerSeeds(input.db)) {
        const alreadyOpen = existingObjectives.some((objective) => (
          objective.title === seed.title && !isTerminalObjectiveStatus(objective.status)
        ))
        if (alreadyOpen || (seed.dedupeKey && openCompareRequestFamilies.has(seed.dedupeKey))) {
          continue
        }

        const started = await input.runtime.startObjective({
          title: seed.title,
          objectiveKind: seed.objectiveKind,
          prompt: seed.prompt,
          initiatedBy: 'system'
        })

        input.runtime.createProposal({
          objectiveId: started.objective.objectiveId,
          threadId: started.mainThread.threadId,
          proposedByParticipantId: seed.initialProposal.proposedByParticipantId,
          proposalKind: seed.initialProposal.proposalKind,
          payload: seed.initialProposal.payload,
          ownerRole: seed.initialProposal.ownerRole,
          requiredApprovals: seed.initialProposal.requiredApprovals,
          allowVetoBy: seed.initialProposal.allowVetoBy,
          requiresOperatorConfirmation: seed.initialProposal.requiresOperatorConfirmation,
          artifactRefs: seed.initialProposal.artifactRefs
        })

        const createdDetail = input.runtime.getObjectiveDetail({
          objectiveId: started.objective.objectiveId
        })
        if (createdDetail) {
          createdObjectives.push(createdDetail)
          existingObjectives.unshift(createdDetail)
          if (seed.dedupeKey) {
            openCompareRequestFamilies.add(seed.dedupeKey)
          }
        }
      }

      return createdObjectives
    }
  }
}
