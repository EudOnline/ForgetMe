import { listAgentPolicyVersions } from './governancePersistenceService'
import type { createExternalVerificationBrokerService } from './externalVerificationBrokerService'
import { runMemoryWorkspaceCompare } from './memoryWorkspaceCompareService'
import { askMemoryWorkspacePersisted } from './memoryWorkspaceSessionService'
import { createObjectiveRuntimeDeliberationService } from './objectiveRuntimeDeliberationService'
import { createObjectiveRuntimeProposalDecisionService } from './objectiveRuntimeProposalDecisionService'
import { createObjectiveRuntimeProposalStateService } from './objectiveRuntimeProposalStateService'
import { createObjectiveTriggerService } from './objectiveTriggerService'
import { createObjectiveSubagentExecutionService } from './objectiveSubagentExecutionService'
import type { createSubagentRegistryService } from './subagentRegistryService'
import type {
  AgentArtifactRef,
  AgentMessageKind,
  AgentObjectiveDetail,
  AgentThreadDetail,
  ConfirmAgentProposalInput,
  ListAgentObjectivesInput,
  RespondToAgentProposalInput
} from '../../shared/objectiveRuntimeContracts'
import {
  appendAgentMessageV2,
  createCheckpoint,
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

export type ObjectiveRuntimeDependencies = {
  db: ArchiveDatabase
  facilitator: FacilitatorService
  externalVerificationBroker: ExternalVerificationBrokerService
  subagentRegistry: SubagentRegistryService
  roleAgentRegistry?: RoleAgentRegistryService | null
  runMemoryWorkspaceCompare?: RunMemoryWorkspaceCompareService
  askMemoryWorkspacePersisted?: AskMemoryWorkspacePersistedService
  listAgentPolicyVersions?: ListAgentPolicyVersionsService
}

export function createObjectiveRuntimeService(dependencies: ObjectiveRuntimeDependencies) {
  const { db } = dependencies

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

  const proposalStateService = createObjectiveRuntimeProposalStateService({
    db
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
    let roundsWithoutProgress = 0
    let lastResult = await deliberationService.deliberateThreadPass(input)

    for (let roundIndex = 0; roundIndex < 6; roundIndex += 1) {
      const hasNewArtifacts = (
        lastResult.newMessageCount
        + lastResult.newProposalCount
        + lastResult.newSpawnCount
      ) > 0

      roundsWithoutProgress = hasNewArtifacts ? 0 : roundsWithoutProgress + 1

      const stopState = dependencies.facilitator.classifyStopState({
        objective: lastResult.objective,
        thread: lastResult.thread,
        roundsWithoutProgress,
        hasNewArtifacts
      })

      if (stopState.reason !== 'progress') {
        updateObjectiveStatus(db, {
          objectiveId: lastResult.objective.objectiveId,
          status: stopState.nextObjectiveStatus,
          requiresOperatorInput: stopState.requiresOperatorInput
        })
        updateThreadStatus(db, {
          threadId: lastResult.thread.threadId,
          status: stopState.nextThreadStatus
        })

        if (stopState.checkpoint) {
          const hasEquivalentCheckpoint = lastResult.objective.checkpoints.some((checkpoint) => (
            checkpoint.threadId === lastResult.thread.threadId
            && checkpoint.checkpointKind === stopState.checkpoint?.checkpointKind
            && checkpoint.title === stopState.checkpoint?.title
            && checkpoint.summary === stopState.checkpoint?.summary
          ))

          if (!hasEquivalentCheckpoint) {
            createCheckpoint(db, {
              objectiveId: lastResult.objective.objectiveId,
              threadId: lastResult.thread.threadId,
              checkpointKind: stopState.checkpoint.checkpointKind,
              title: stopState.checkpoint.title,
              summary: stopState.checkpoint.summary
            })
          }
        }

        return {
          objective: getObjectiveDetail(db, { objectiveId: lastResult.objective.objectiveId }) ?? lastResult.objective,
          thread: getThreadDetail(db, { threadId: lastResult.thread.threadId }) ?? lastResult.thread
        }
      }

      if (roundIndex === 5) {
        return {
          objective: lastResult.objective,
          thread: lastResult.thread
        }
      }

      lastResult = await deliberationService.deliberateThreadPass(input)
    }

    return {
      objective: lastResult.objective,
      thread: lastResult.thread
    }
  }

  const proposalDecisionService = createObjectiveRuntimeProposalDecisionService({
    db,
    proposalStateService
  })

  const subagentExecutionService = createObjectiveSubagentExecutionService({
    db,
    externalVerificationBroker: dependencies.externalVerificationBroker,
    subagentRegistry: dependencies.subagentRegistry,
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

      const settled = await subagentExecutionService.autoCommitEligibleSpawnSubagentProposal(updated)
      await deliberateThread({
        threadId: settled.threadId
      })

      return settled
    },

    async confirmAgentProposal(input: ConfirmAgentProposalInput) {
      const updated = await proposalDecisionService.confirmAgentProposal(input)
      if (!updated) {
        return null
      }

      if (updated.status === 'committed') {
        await subagentExecutionService.executeCommittedSpawnSubagentProposal(updated)
      }

      await deliberateThread({
        threadId: updated.threadId
      })

      return updated
    },

    getObjectiveDetail: getRuntimeObjectiveDetail
  }
}
