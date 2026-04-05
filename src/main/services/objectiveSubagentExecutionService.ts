import type {
  createExternalVerificationBrokerService
} from './externalVerificationBrokerService'
import { createObjectiveRuntimeConfigService } from './objectiveRuntimeConfigService'
import { createObjectiveSubagentDelegationService } from './objectiveSubagentDelegationService'
import { createObjectiveSubagentLifecycleService } from './objectiveSubagentLifecycleService'
import {
  createObjectiveSubagentPlanningService,
  type ObjectiveSubagentExecutionPlan
} from './objectiveSubagentPlanningService'
import {
  createObjectiveSubagentSpecializationService,
  type ActiveSubagentExecutionContext,
  type AskMemoryWorkspacePersistedService,
  type ListAgentPolicyVersionsService,
  type RegisteredSubagentOutcome,
  type RunMemoryWorkspaceCompareService
} from './objectiveSubagentSpecializationService'
import {
  createObjectiveSubagentRoutingService
} from './objectiveSubagentRoutingService'
import { createObjectiveSubagentToolExecutionService } from './objectiveSubagentToolExecutionService'
import type { createSubagentRegistryService } from './subagentRegistryService'
import type {
  AgentArtifactRef,
  AgentMessageKind,
  AgentProposalRecord,
  AgentProposalStatus,
  AgentSkillPackId,
  AgentThreadDetail
} from '../../shared/archiveContracts'
import {
  createCheckpoint,
  getThreadDetail,
  type CreateProposalInput
} from './objectivePersistenceService'
import type { ArchiveDatabase } from './db'

type ExternalVerificationBrokerService = ReturnType<typeof createExternalVerificationBrokerService>
type SubagentRegistryService = ReturnType<typeof createSubagentRegistryService>
type ProposalRuntimeState = {
  proposal: AgentProposalRecord
  votes: AgentThreadDetail['votes']
  messages: AgentThreadDetail['messages']
}
type DelegationDepthThreadNode = Pick<AgentThreadDetail, 'threadKind' | 'parentThreadId'>

export function calculateThreadDelegationDepth(input: {
  threadId: string
  lookupThread: (threadId: string) => DelegationDepthThreadNode | null
}) {
  let depth = 0
  let currentThreadId: string | null = input.threadId

  while (currentThreadId) {
    const thread = input.lookupThread(currentThreadId)
    if (!thread) {
      break
    }

    if (thread.threadKind === 'subthread') {
      depth += 1
    }

    currentThreadId = thread.parentThreadId
  }

  return depth + 1
}

export function exceedsThreadDelegationDepthLimit(input: {
  executionDepth: number
  maxDelegationDepth: number
}) {
  return input.executionDepth > input.maxDelegationDepth
}

export type ObjectiveSubagentExecutionDependencies = {
  db: ArchiveDatabase
  externalVerificationBroker: ExternalVerificationBrokerService
  subagentRegistry: SubagentRegistryService
  runtimeConfig?: ReturnType<typeof createObjectiveRuntimeConfigService>
  runMemoryWorkspaceCompare?: RunMemoryWorkspaceCompareService
  askMemoryWorkspacePersisted?: AskMemoryWorkspacePersistedService
  listAgentPolicyVersions?: ListAgentPolicyVersionsService
  helpers: {
    appendRuntimeMessage: (input: {
      objectiveId: string
      threadId: string
      fromParticipantId: string
      toParticipantId?: string | null
      kind: AgentMessageKind
      body: string
      refs?: AgentArtifactRef[]
      blocking?: boolean
      confidence?: number | null
    }) => unknown
    createProposalWithCheckpoint: (input: CreateProposalInput) => AgentProposalRecord
    loadProposalRuntimeState: (proposalId: string) => ProposalRuntimeState
    updateProposalFromGate: (input: {
      proposalId: string
      nextStatus: AgentProposalStatus
      messageId?: string
    }) => AgentProposalRecord
  }
}

export function createObjectiveSubagentExecutionService(dependencies: ObjectiveSubagentExecutionDependencies) {
  const { db } = dependencies
  const runtimeConfig = dependencies.runtimeConfig ?? createObjectiveRuntimeConfigService({
    env: {}
  })
  let executeCommittedSpawnSubagentProposalImpl: ((proposal: AgentProposalRecord) => Promise<unknown>) | null = null

  function asErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message
    }

    return String(error)
  }

  const toolExecutionService = createObjectiveSubagentToolExecutionService({
    db
  })
  const planningService = createObjectiveSubagentPlanningService({
    subagentRegistry: dependencies.subagentRegistry
  })

  function getSubagentProfile(specialization: AgentSkillPackId) {
    return dependencies.subagentRegistry.getProfile(specialization)
  }

  function getRequiredToolPolicyId(specialization: AgentSkillPackId) {
    const toolPolicyId = getSubagentProfile(specialization).defaultToolPolicyId
    if (!toolPolicyId) {
      throw new Error(`Subagent specialization ${specialization} is missing a default tool policy`)
    }

    return toolPolicyId
  }

  function formatExecutionPlan(plan: ObjectiveSubagentExecutionPlan) {
    const lines = [
      `Execution plan for ${plan.specialization}:`,
      ...plan.steps.map((step, index) => `${index + 1}. ${step.title}`),
      `Stop conditions: ${plan.stopConditions.join('; ')}.`,
      `Delegation allowed: ${plan.delegationAllowed ? 'yes' : 'no'}.`
    ]

    return lines.join('\n')
  }

  function getThreadDelegationDepth(threadId: string) {
    return calculateThreadDelegationDepth({
      threadId,
      lookupThread: (candidateThreadId) => {
        const thread = getThreadDetail(db, { threadId: candidateThreadId })
        if (!thread) {
          return null
        }

        return {
          threadKind: thread.threadKind,
          parentThreadId: thread.parentThreadId
        }
      }
    })
  }

  const lifecycleService = createObjectiveSubagentLifecycleService({
    db,
    subagentRegistry: dependencies.subagentRegistry,
    appendRuntimeMessage: dependencies.helpers.appendRuntimeMessage
  })

  async function executeRegisteredSubagent<TExtra extends Record<string, unknown> = Record<never, never>>(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    specialization: AgentSkillPackId
    title: string
    goalBody: string
    spawnSummary: string
    failureLabel: string
    run: (context: ActiveSubagentExecutionContext) => Promise<RegisteredSubagentOutcome<TExtra>>
  }) {
    const profile = getSubagentProfile(input.specialization)
    const executionDepth = getThreadDelegationDepth(input.proposal.threadId)
    if (exceedsThreadDelegationDepthLimit({
      executionDepth,
      maxDelegationDepth: profile.maxDelegationDepth
    })) {
      throw new Error(`Subagent delegation depth exceeds max delegation depth ${profile.maxDelegationDepth} for ${input.specialization}.`)
    }

    const executionPlan = planningService.createPlan({
      specialization: input.specialization,
      proposal: input.proposal
    })
    const toolPolicyId = input.proposal.toolPolicyId ?? getRequiredToolPolicyId(input.specialization)
    const executionBudget = input.proposal.budget ?? { ...profile.defaultBudget }
    const remainingBudget = {
      ...executionBudget
    }
    const consumedSingleUsePlanSteps = new Set<string>()

    toolExecutionService.consumeExecutionRound(remainingBudget)

    const execution = lifecycleService.startRegisteredSubagentExecution({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: input.specialization,
      title: input.title,
      goalBody: input.goalBody,
      toolPolicyId,
      executionBudget,
      spawnSummary: input.spawnSummary
    })

    dependencies.helpers.appendRuntimeMessage({
      objectiveId: input.proposal.objectiveId,
      threadId: execution.subthread.threadId,
      fromParticipantId: execution.createdSubagent.subagentId,
      kind: 'decision',
      body: formatExecutionPlan(executionPlan)
    })
    createCheckpoint(db, {
      objectiveId: input.proposal.objectiveId,
      threadId: execution.subthread.threadId,
      checkpointKind: 'subagent_plan_recorded',
      title: 'Subagent plan recorded',
      summary: `Recorded execution plan for ${input.specialization}.`,
      relatedProposalId: input.proposal.proposalId
    })

    const resolvePlanStep = (toolName: string) => {
      for (const step of executionPlan.toolSequence) {
        if (step.toolName !== toolName) {
          continue
        }

        if (!step.repeatable && consumedSingleUsePlanSteps.has(step.stepId)) {
          continue
        }

        if (!step.repeatable) {
          consumedSingleUsePlanSteps.add(step.stepId)
        }

        return step
      }

      throw new Error(`Tool ${toolName} is not permitted by the execution plan for ${input.specialization}.`)
    }

    const runTool = <T,>(toolInput: {
      toolName: string
      inputPayload: Record<string, unknown>
      run: () => Promise<{
        result: T
        outputPayload: Record<string, unknown>
        artifactRefs?: AgentArtifactRef[]
      }>
    }) => toolExecutionService.runAuthorizedTool({
      ...(() => {
        const planStep = resolvePlanStep(toolInput.toolName)

        return {
          objectiveId: input.proposal.objectiveId,
          threadId: execution.subthread.threadId,
          proposalId: input.proposal.proposalId,
          requestedByParticipantId: execution.createdSubagent.subagentId,
          role: input.proposal.ownerRole,
          toolName: toolInput.toolName,
          toolPolicyId,
          skillPackIds: profile.skillPackIds,
          remainingBudget,
          inputPayload: {
            ...toolInput.inputPayload,
            planStepId: planStep.stepId,
            planStepTitle: planStep.title
          },
          run: toolInput.run
        }
      })()
    })

    try {
      const delegateSubagentFromRunner: ActiveSubagentExecutionContext['delegateSubagentFromRunner'] = async (delegateInput) => {
        if (runtimeConfig.getConfig().disableNestedDelegation) {
          throw new Error('Nested delegation is disabled by runtime config.')
        }

        if (!executionPlan.delegationAllowed) {
          throw new Error(`Execution plan does not allow nested delegation for ${input.specialization}.`)
        }

        return delegationService.delegateSubagentFromRunner(delegateInput)
      }

      const outcome = await input.run({
        ...execution,
        executionPlan,
        toolPolicyId,
        remainingBudget,
        skillPackIds: profile.skillPackIds,
        runTool,
        delegateSubagentFromRunner
      })
      const {
        summary,
        refs,
        checkpointKind,
        checkpointTitle,
        checkpointSummary,
        checkpointMetadata,
        ...extra
      } = outcome

      return {
        ...lifecycleService.completeRegisteredSubagentExecution({
          proposal: input.proposal,
          subthread: execution.subthread,
          createdSubagent: execution.createdSubagent,
          summary,
          refs,
          checkpointKind,
          checkpointTitle,
          checkpointSummary,
          checkpointMetadata
        }),
        ...(extra as unknown as TExtra)
      }
    } catch (error) {
      lifecycleService.failRegisteredSubagentExecution({
        subthreadId: execution.subthread.threadId,
        subagentId: execution.createdSubagent.subagentId,
        summary: `${input.failureLabel} failed: ${asErrorMessage(error)}`
      })
      throw error
    }
  }

  const delegationService = createObjectiveSubagentDelegationService({
    db,
    subagentRegistry: dependencies.subagentRegistry,
    helpers: {
      appendRuntimeMessage: dependencies.helpers.appendRuntimeMessage,
      createProposalWithCheckpoint: dependencies.helpers.createProposalWithCheckpoint,
      loadProposalRuntimeState: dependencies.helpers.loadProposalRuntimeState,
      updateProposalFromGate: dependencies.helpers.updateProposalFromGate
    },
    executeCommittedSpawnSubagentProposal
  })

  async function executeCommittedSpawnSubagentProposal(proposal: AgentProposalRecord) {
    if (!executeCommittedSpawnSubagentProposalImpl) {
      throw new Error('Subagent routing service is not initialized')
    }

    return executeCommittedSpawnSubagentProposalImpl(proposal)
  }

  const specializationService = createObjectiveSubagentSpecializationService({
    db,
    externalVerificationBroker: dependencies.externalVerificationBroker,
    runMemoryWorkspaceCompare: dependencies.runMemoryWorkspaceCompare,
    askMemoryWorkspacePersisted: dependencies.askMemoryWorkspacePersisted,
    listAgentPolicyVersions: dependencies.listAgentPolicyVersions,
    helpers: {
      appendRuntimeMessage: dependencies.helpers.appendRuntimeMessage
    },
    delegateSubagentFromRunner: delegationService.delegateSubagentFromRunner,
    executeRegisteredSubagent
  })

  const routingService = createObjectiveSubagentRoutingService<
    Awaited<ReturnType<typeof specializationService.runWebVerifierSubagent>>,
    Awaited<ReturnType<typeof specializationService.runEvidenceCheckerSubagent>>,
    Awaited<ReturnType<typeof specializationService.runCompareAnalystSubagent>>,
    Awaited<ReturnType<typeof specializationService.runDraftComposerSubagent>>,
    Awaited<ReturnType<typeof specializationService.runPolicyAuditorSubagent>>
  >({
    subagentRegistry: dependencies.subagentRegistry,
    helpers: {
      createProposalWithCheckpoint: dependencies.helpers.createProposalWithCheckpoint,
      updateProposalFromGate: dependencies.helpers.updateProposalFromGate
    },
    runWebVerifierSubagent: specializationService.runWebVerifierSubagent,
    runEvidenceCheckerSubagent: specializationService.runEvidenceCheckerSubagent,
    runCompareAnalystSubagent: specializationService.runCompareAnalystSubagent,
    runDraftComposerSubagent: specializationService.runDraftComposerSubagent,
    runPolicyAuditorSubagent: specializationService.runPolicyAuditorSubagent
  })
  executeCommittedSpawnSubagentProposalImpl = routingService.executeCommittedSpawnSubagentProposal

  return {
    executeCommittedSpawnSubagentProposal,
    autoCommitEligibleSpawnSubagentProposal: routingService.autoCommitEligibleSpawnSubagentProposal,
    requestExternalVerification: routingService.requestExternalVerification
  }
}
