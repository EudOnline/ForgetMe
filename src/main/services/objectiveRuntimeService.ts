import { listAgentPolicyVersions } from './governancePersistenceService'
import type { createExternalVerificationBrokerService } from './externalVerificationBrokerService'
import { runMemoryWorkspaceCompare } from './memoryWorkspaceCompareService'
import { askMemoryWorkspacePersisted } from './memoryWorkspaceSessionService'
import { createObjectiveRuntimeConfigService } from './objectiveRuntimeConfigService'
import { createObjectiveRuntimeDeliberationService } from './objectiveRuntimeDeliberationService'
import {
  asObjectiveRuntimeFailureMessage,
  normalizeObjectiveRuntimeFailure
} from './objectiveRuntimeFailureService'
import { createObjectiveRuntimeProposalDecisionService } from './objectiveRuntimeProposalDecisionService'
import { createObjectiveRuntimeProposalStateService } from './objectiveRuntimeProposalStateService'
import { createObjectiveRuntimeRecoveryService } from './objectiveRuntimeRecoveryService'
import { createObjectiveRuntimeTelemetryService } from './objectiveRuntimeTelemetryService'
import { createObjectiveTriggerService } from './objectiveTriggerService'
import { createObjectiveSubagentExecutionService } from './objectiveSubagentExecutionService'
import type { createSubagentRegistryService } from './subagentRegistryService'
import type {
  AgentArtifactRef,
  AgentMessageKind,
  AgentObjectiveDetail,
  AgentProposalRecord,
  AgentThreadDetail,
  ConfirmAgentProposalInput,
  ListAgentObjectivesInput,
  RespondToAgentProposalInput
} from '../../shared/objectiveRuntimeContracts'
import {
  appendAgentMessageV2,
  createCheckpoint,
  getProposal,
  listObjectives,
  getObjectiveDetail,
  getThreadDetail,
  updateObjectiveStatus,
  updateThreadStatus,
  type CreateProposalInput
} from './objectivePersistenceService'
import type { ArchiveDatabase } from './db'
import type { createFacilitatorAgentService } from './agents/facilitatorAgentService'
import type { createRoleAgentRegistryService } from './agents/roleAgentRegistryService'

type FacilitatorService = ReturnType<typeof createFacilitatorAgentService>
type ExternalVerificationBrokerService = ReturnType<typeof createExternalVerificationBrokerService>
type SubagentRegistryService = ReturnType<typeof createSubagentRegistryService>
type RoleAgentRegistryService = ReturnType<typeof createRoleAgentRegistryService>
type RunMemoryWorkspaceCompareService = typeof runMemoryWorkspaceCompare
type AskMemoryWorkspacePersistedService = typeof askMemoryWorkspacePersisted
type ListAgentPolicyVersionsService = typeof listAgentPolicyVersions
type RecoveryCooldownService = (ms: number) => Promise<void>

export type ObjectiveRuntimeDependencies = {
  db: ArchiveDatabase
  facilitator: FacilitatorService
  externalVerificationBroker: ExternalVerificationBrokerService
  subagentRegistry: SubagentRegistryService
  runtimeTelemetry?: ReturnType<typeof createObjectiveRuntimeTelemetryService>
  runtimeConfig?: ReturnType<typeof createObjectiveRuntimeConfigService>
  runtimeRecovery?: ReturnType<typeof createObjectiveRuntimeRecoveryService>
  roleAgentRegistry?: RoleAgentRegistryService | null
  runMemoryWorkspaceCompare?: RunMemoryWorkspaceCompareService
  askMemoryWorkspacePersisted?: AskMemoryWorkspacePersistedService
  listAgentPolicyVersions?: ListAgentPolicyVersionsService
  recoveryCooldown?: RecoveryCooldownService
}

export function createObjectiveRuntimeService(dependencies: ObjectiveRuntimeDependencies) {
  const { db } = dependencies
  const runtimeTelemetry = dependencies.runtimeTelemetry ?? createObjectiveRuntimeTelemetryService({ db })
  const runtimeConfig = dependencies.runtimeConfig ?? createObjectiveRuntimeConfigService({
    env: {}
  })
  const runtimeRecovery = dependencies.runtimeRecovery ?? createObjectiveRuntimeRecoveryService({
    runtimeConfig
  })

  function asErrorMessage(error: unknown) {
    return asObjectiveRuntimeFailureMessage(error)
  }

  const recoveryCooldown = dependencies.recoveryCooldown ?? (async (ms: number) => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  })

  function nextRound(threadId: string) {
    const detail = getThreadDetail(db, { threadId })
    const lastRound = detail?.messages.at(-1)?.round ?? 0
    return lastRound + 1
  }

  function appendRuntimeMessage(input: {
    objectiveId: string
    threadId: string
    fromParticipantId: string
    toParticipantId?: string | null
    kind: AgentMessageKind
    body: string
    refs?: AgentArtifactRef[]
    blocking?: boolean
    confidence?: number | null
  }) {
    return appendAgentMessageV2(db, {
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      fromParticipantId: input.fromParticipantId,
      toParticipantId: input.toParticipantId,
      kind: input.kind,
      body: input.body,
      refs: input.refs,
      round: nextRound(input.threadId),
      blocking: input.blocking,
      confidence: input.confidence
    })
  }

  function countRecoveryAttempts(proposalId: string) {
    return runtimeTelemetry.listEvents({ proposalId })
      .filter((event) => event.eventType === 'recovery_attempted')
      .length
  }

  function buildFailurePayload(proposal: AgentProposalRecord, error: unknown) {
    const payload: Record<string, unknown> = {
      message: asErrorMessage(error)
    }
    const specialization = typeof proposal.payload.specialization === 'string'
      ? proposal.payload.specialization
      : null

    if (specialization) {
      payload.specialization = specialization
    }

    return payload
  }

  function recordRecoveryCheckpoint(input: {
    proposal: AgentProposalRecord
    checkpointKind: 'runtime_recovery_attempted' | 'runtime_recovery_exhausted'
    title: string
    summary: string
  }) {
    createCheckpoint(db, {
      objectiveId: input.proposal.objectiveId,
      threadId: input.proposal.threadId,
      checkpointKind: input.checkpointKind,
      title: input.title,
      summary: input.summary,
      relatedProposalId: input.proposal.proposalId
    })
  }

  function decideRecoveryAfterFailure(proposal: AgentProposalRecord, error: unknown) {
    const priorAttemptCount = countRecoveryAttempts(proposal.proposalId)
    const recoveryPlan = runtimeRecovery.decideRecovery({
      proposal,
      failure: error,
      priorAttemptCount
    })

    if (recoveryPlan.failureEventType) {
      runtimeTelemetry.recordEvent({
        objectiveId: proposal.objectiveId,
        threadId: proposal.threadId,
        proposalId: proposal.proposalId,
        eventType: recoveryPlan.failureEventType,
        payload: buildFailurePayload(proposal, error)
      })
    }

    return {
      priorAttemptCount,
      recoveryPlan
    }
  }

  const proposalStateService = createObjectiveRuntimeProposalStateService({
    db,
    runtimeTelemetry,
    runtimeConfig
  })

  const deliberationService = createObjectiveRuntimeDeliberationService({
    db,
    roleAgentRegistry: dependencies.roleAgentRegistry,
    subagentRegistry: dependencies.subagentRegistry,
    nextRound,
    appendRuntimeMessage,
    createProposalWithCheckpoint: proposalStateService.createProposalWithCheckpoint
  })

  async function deliberateThread(input: {
    threadId: string
  }) {
    function applyFacilitatorPlan(plan: ReturnType<FacilitatorService['planNextStep']>, objectiveId: string, threadId: string) {
      updateObjectiveStatus(db, {
        objectiveId,
        status: plan.nextObjectiveStatus,
        requiresOperatorInput: plan.requiresOperatorInput
      })
      updateThreadStatus(db, {
        threadId,
        status: plan.nextThreadStatus
      })

      if (plan.checkpoint) {
        const objectiveDetail = getObjectiveDetail(db, { objectiveId })
        const hasEquivalentCheckpoint = objectiveDetail?.checkpoints.some((checkpoint) => (
          checkpoint.threadId === threadId
          && checkpoint.checkpointKind === plan.checkpoint?.checkpointKind
          && checkpoint.title === plan.checkpoint?.title
          && checkpoint.summary === plan.checkpoint?.summary
        ))

        if (!hasEquivalentCheckpoint) {
          createCheckpoint(db, {
            objectiveId,
            threadId,
            checkpointKind: plan.checkpoint.checkpointKind,
            title: plan.checkpoint.title,
            summary: plan.checkpoint.summary
          })
        }
      }

      const roundCount = getThreadDetail(db, { threadId })?.messages.at(-1)?.round ?? 0
      if (currentObjective && currentObjective.status !== plan.nextObjectiveStatus) {
        if (plan.nextObjectiveStatus === 'stalled') {
          runtimeTelemetry.recordObjectiveStalled({
            objectiveId,
            threadId,
            roundCount
          })
        } else if (plan.nextObjectiveStatus === 'completed') {
          runtimeTelemetry.recordObjectiveCompleted({
            objectiveId,
            threadId,
            roundCount
          })
        }
      }

      return {
        objective: getObjectiveDetail(db, { objectiveId }),
        thread: getThreadDetail(db, { threadId })
      }
    }

    let roundsWithoutProgress = 0

    let currentThread = getThreadDetail(db, { threadId: input.threadId })
    if (!currentThread) {
      throw new Error(`thread not found: ${input.threadId}`)
    }

    let currentObjective = getObjectiveDetail(db, { objectiveId: currentThread.objectiveId })
    if (!currentObjective) {
      throw new Error(`objective not found: ${currentThread.objectiveId}`)
    }

    for (let roundIndex = 0; roundIndex < 6; roundIndex += 1) {
      const prePlan = dependencies.facilitator.planNextStep({
        objective: currentObjective,
        thread: currentThread,
        roundsWithoutProgress,
        hasNewArtifacts: false
      })

      if (prePlan.nextAction !== 'continue_deliberation') {
        const applied = applyFacilitatorPlan(prePlan, currentObjective.objectiveId, currentThread.threadId)
        return {
          objective: applied.objective ?? currentObjective,
          thread: applied.thread ?? currentThread
        }
      }

      const lastResult = await deliberationService.deliberateThreadPass(input)
      const hasNewArtifacts = (
        lastResult.newMessageCount
        + lastResult.newProposalCount
        + lastResult.newSpawnCount
      ) > 0

      roundsWithoutProgress = hasNewArtifacts ? 0 : roundsWithoutProgress + 1

      currentObjective = lastResult.objective
      currentThread = lastResult.thread

      const plan = dependencies.facilitator.planNextStep({
        objective: lastResult.objective,
        thread: lastResult.thread,
        roundsWithoutProgress,
        hasNewArtifacts
      })

      if (plan.nextAction !== 'continue_deliberation') {
        const applied = applyFacilitatorPlan(plan, lastResult.objective.objectiveId, lastResult.thread.threadId)
        return {
          objective: applied.objective ?? lastResult.objective,
          thread: applied.thread ?? lastResult.thread
        }
      }

      if (roundIndex === 5) {
        return {
          objective: currentObjective,
          thread: currentThread
        }
      }
    }

    return {
      objective: currentObjective,
      thread: currentThread
    }
  }

  const proposalDecisionService = createObjectiveRuntimeProposalDecisionService({
    db,
    proposalStateService,
    runtimeTelemetry,
    runtimeConfig
  })

  const subagentExecutionService = createObjectiveSubagentExecutionService({
    db,
    externalVerificationBroker: dependencies.externalVerificationBroker,
    subagentRegistry: dependencies.subagentRegistry,
    runtimeConfig,
    runMemoryWorkspaceCompare: dependencies.runMemoryWorkspaceCompare,
    askMemoryWorkspacePersisted: dependencies.askMemoryWorkspacePersisted,
    listAgentPolicyVersions: dependencies.listAgentPolicyVersions,
    helpers: {
      appendRuntimeMessage,
      createProposalWithCheckpoint: proposalStateService.createProposalWithCheckpoint,
      loadProposalRuntimeState: proposalStateService.loadProposalRuntimeState,
      updateProposalFromGate: proposalStateService.updateProposalFromGate
    }
  })

  async function executeCommittedSpawnProposalWithRecovery(proposal: AgentProposalRecord) {
    try {
      return await subagentExecutionService.executeCommittedSpawnSubagentProposal(proposal)
    } catch (error) {
      const runtimeFailure = normalizeObjectiveRuntimeFailure(error, proposal)
      const { priorAttemptCount, recoveryPlan } = decideRecoveryAfterFailure(proposal, runtimeFailure)

      if (!recoveryPlan.shouldRetry) {
        runtimeTelemetry.recordEvent({
          objectiveId: proposal.objectiveId,
          threadId: proposal.threadId,
          proposalId: proposal.proposalId,
          eventType: 'recovery_exhausted',
          payload: {
            decision: recoveryPlan.decision,
            reason: recoveryPlan.reason,
            failureType: recoveryPlan.failureType,
            attemptNumber: priorAttemptCount
          }
        })
        recordRecoveryCheckpoint({
          proposal,
          checkpointKind: 'runtime_recovery_exhausted',
          title: 'Runtime recovery surfaced to operator',
          summary: `Runtime surfaced ${recoveryPlan.failureType} after deciding ${recoveryPlan.decision} (${recoveryPlan.reason}).`
        })
        throw runtimeFailure
      }

      runtimeTelemetry.recordEvent({
        objectiveId: proposal.objectiveId,
        threadId: proposal.threadId,
        proposalId: proposal.proposalId,
        eventType: 'recovery_attempted',
        payload: {
          decision: recoveryPlan.decision,
          reason: recoveryPlan.reason,
          failureType: recoveryPlan.failureType,
          attemptNumber: priorAttemptCount + 1
        }
      })
      recordRecoveryCheckpoint({
        proposal,
        checkpointKind: 'runtime_recovery_attempted',
        title: 'Runtime recovery attempted',
        summary: `Runtime retried ${recoveryPlan.failureType} via ${recoveryPlan.decision} (${recoveryPlan.reason}).`
      })

      if (recoveryPlan.decision === 'cooldown_then_retry') {
        await recoveryCooldown(25)
      }

      try {
        const result = await subagentExecutionService.executeCommittedSpawnSubagentProposal(proposal)
        runtimeTelemetry.recordEvent({
          objectiveId: proposal.objectiveId,
          threadId: proposal.threadId,
          proposalId: proposal.proposalId,
          eventType: 'objective_recovered',
          payload: {
            recoveredFrom: recoveryPlan.failureType,
            decision: recoveryPlan.decision,
            attemptNumber: priorAttemptCount + 1
          }
        })
        return result
      } catch (retryError) {
        const runtimeFailure = normalizeObjectiveRuntimeFailure(retryError, proposal)
        const retryPlan = runtimeRecovery.decideRecovery({
          proposal,
          failure: runtimeFailure,
          priorAttemptCount: priorAttemptCount + 1
        })

        if (retryPlan.failureEventType) {
          runtimeTelemetry.recordEvent({
            objectiveId: proposal.objectiveId,
            threadId: proposal.threadId,
            proposalId: proposal.proposalId,
            eventType: retryPlan.failureEventType,
            payload: buildFailurePayload(proposal, runtimeFailure)
          })
        }

        runtimeTelemetry.recordEvent({
          objectiveId: proposal.objectiveId,
          threadId: proposal.threadId,
          proposalId: proposal.proposalId,
          eventType: 'recovery_exhausted',
          payload: {
            decision: 'surface_to_operator',
            reason: retryPlan.reason,
            failureType: retryPlan.failureType,
            attemptNumber: priorAttemptCount + 1
          }
        })
        recordRecoveryCheckpoint({
          proposal,
          checkpointKind: 'runtime_recovery_exhausted',
          title: 'Runtime recovery exhausted',
          summary: `Runtime stopped after one bounded retry because ${retryPlan.failureType} persisted (${retryPlan.reason}).`
        })
        throw runtimeFailure
      }
    }
  }

  async function startObjective(input: {
    title: string
    objectiveKind: Parameters<FacilitatorService['acceptObjective']>[0]['objectiveKind']
    prompt: string
    initiatedBy?: Parameters<FacilitatorService['acceptObjective']>[0]['initiatedBy']
  }) {
    const started = dependencies.facilitator.acceptObjective({
      db,
      title: input.title,
      objectiveKind: input.objectiveKind,
      prompt: input.prompt,
      initiatedBy: input.initiatedBy
    })
    runtimeTelemetry.recordObjectiveStarted({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      objectiveKind: started.objective.objectiveKind,
      initiatedBy: started.objective.initiatedBy
    })

    await deliberateThread({
      threadId: started.mainThread.threadId
    })

    return started
  }

  function createProposal(input: Omit<CreateProposalInput, 'status'> & {
    status?: CreateProposalInput['status']
  }) {
    return proposalStateService.createProposalWithCheckpoint({
      ...input,
      requiredApprovals: input.requiredApprovals ?? [input.ownerRole],
      allowVetoBy: input.allowVetoBy ?? ['governance'],
      status: input.status ?? 'under_review'
    })
  }

  function listRuntimeObjectives(input?: ListAgentObjectivesInput) {
    return listObjectives(db, input)
  }

  function getRuntimeObjectiveDetail(input: {
    objectiveId: string
  }): AgentObjectiveDetail | null {
    return getObjectiveDetail(db, input)
  }

  function getRuntimeThreadDetail(input: {
    threadId: string
  }): AgentThreadDetail | null {
    return getThreadDetail(db, input)
  }

  const objectiveTriggerService = createObjectiveTriggerService({
    db,
    runtime: {
      startObjective,
      createProposal,
      listObjectives: () => listRuntimeObjectives(),
      getObjectiveDetail: getRuntimeObjectiveDetail
    }
  })

  return {
    startObjective,

    createProposal,

    async refreshObjectiveTriggers() {
      return objectiveTriggerService.refreshObjectiveTriggers()
    },

    raiseBlockingChallenge(input: {
      objectiveId: string
      threadId: string
      proposalId: string
      fromParticipantId: string
      body: string
    }) {
      return proposalDecisionService.raiseBlockingChallenge(input)
    },

    vetoProposal(input: {
      objectiveId: string
      threadId: string
      proposalId: string
      rationale: string
    }) {
      return proposalDecisionService.vetoProposal(input)
    },

    async requestExternalVerification(input: {
      objectiveId: string
      threadId: string
      proposedByParticipantId: string
      claim: string
      query: string
    }) {
      return subagentExecutionService.requestExternalVerification(input)
    },

    approveProposalAsOwner(input: {
      objectiveId: string
      threadId: string
      proposalId: string
    }) {
      return proposalDecisionService.approveProposalAsOwner(input)
    },

    listObjectives: listRuntimeObjectives,

    getThreadDetail: getRuntimeThreadDetail,

    deliberateThread,

    async respondToAgentProposal(input: RespondToAgentProposalInput) {
      const updated = await proposalDecisionService.respondToAgentProposal(input)
      if (!updated) {
        return null
      }

      const autoCommitted = proposalDecisionService.autoCommitProposalIfEligible(updated)
      let settled = autoCommitted

      if (autoCommitted.proposalKind === 'spawn_subagent') {
        if (autoCommitted.status === 'committed') {
          await executeCommittedSpawnProposalWithRecovery(autoCommitted)
        } else {
          settled = await subagentExecutionService.autoCommitEligibleSpawnSubagentProposal(autoCommitted)
        }
      }

      await deliberateThread({
        threadId: settled.threadId
      })

      return settled
    },

    async confirmAgentProposal(input: ConfirmAgentProposalInput) {
      const priorProposal = getProposal(db, { proposalId: input.proposalId })
      const updated = await proposalDecisionService.confirmAgentProposal(input)
      if (!updated) {
        return null
      }

      if (
        updated.proposalKind === 'spawn_subagent'
        && updated.status === 'committed'
        && priorProposal?.status !== 'committed'
      ) {
        await executeCommittedSpawnProposalWithRecovery(updated)
      }

      await deliberateThread({
        threadId: updated.threadId
      })

      return updated
    },

    getObjectiveDetail: getRuntimeObjectiveDetail
  }
}
