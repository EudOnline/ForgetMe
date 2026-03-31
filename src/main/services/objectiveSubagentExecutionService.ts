import type {
  createExternalVerificationBrokerService
} from './externalVerificationBrokerService'
import { createObjectiveSubagentDelegationService } from './objectiveSubagentDelegationService'
import { createObjectiveSubagentLifecycleService } from './objectiveSubagentLifecycleService'
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

export type ObjectiveSubagentExecutionDependencies = {
  db: ArchiveDatabase
  externalVerificationBroker: ExternalVerificationBrokerService
  subagentRegistry: SubagentRegistryService
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
    const toolPolicyId = input.proposal.toolPolicyId ?? getRequiredToolPolicyId(input.specialization)
    const executionBudget = input.proposal.budget ?? { ...profile.defaultBudget }
    const remainingBudget = {
      ...executionBudget
    }

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

    const runTool = <T,>(toolInput: {
      toolName: string
      inputPayload: Record<string, unknown>
      run: () => Promise<{
        result: T
        outputPayload: Record<string, unknown>
        artifactRefs?: AgentArtifactRef[]
      }>
    }) => toolExecutionService.runAuthorizedTool({
      objectiveId: input.proposal.objectiveId,
      threadId: execution.subthread.threadId,
      proposalId: input.proposal.proposalId,
      requestedByParticipantId: execution.createdSubagent.subagentId,
      role: input.proposal.ownerRole,
      toolName: toolInput.toolName,
      toolPolicyId,
      skillPackIds: profile.skillPackIds,
      remainingBudget,
      inputPayload: toolInput.inputPayload,
      run: toolInput.run
    })

    try {
      const outcome = await input.run({
        ...execution,
        toolPolicyId,
        remainingBudget,
        skillPackIds: profile.skillPackIds,
        runTool
      })
      const {
        summary,
        refs,
        checkpointKind,
        checkpointTitle,
        checkpointSummary,
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
          checkpointSummary
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
