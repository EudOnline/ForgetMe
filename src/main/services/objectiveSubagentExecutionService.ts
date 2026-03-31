import type { createExternalVerificationBrokerService } from './externalVerificationBrokerService'
import {
  runCompareAnalystWorkflow,
  runDraftComposerWorkflow,
  runPolicyAuditorWorkflow
} from './objectiveSubagentAnalysisWorkflowService'
import { createObjectiveSubagentDelegationService } from './objectiveSubagentDelegationService'
import { createObjectiveSubagentLifecycleService } from './objectiveSubagentLifecycleService'
import { createObjectiveSubagentToolExecutionService } from './objectiveSubagentToolExecutionService'
import {
  runEvidenceCheckerWorkflow,
  runWebVerifierWorkflow
} from './objectiveSubagentVerificationWorkflowService'
import { runMemoryWorkspaceCompare } from './memoryWorkspaceCompareService'
import { askMemoryWorkspacePersisted } from './memoryWorkspaceSessionService'
import { listAgentPolicyVersions } from './agentPersistenceService'
import type { createSubagentRegistryService } from './subagentRegistryService'
import { parseCompareAnalystPayload } from './subagentRunners/compareAnalystRunner'
import { parseDraftComposerPayload } from './subagentRunners/draftComposerRunner'
import { parsePolicyAuditorPayload } from './subagentRunners/policyAuditorRunner'
import { createSpawnSubagentRunnerRegistry } from './spawnSubagentRunnerRegistryService'
import type {
  AgentArtifactRef,
  AgentMessageKind,
  AgentProposalRecord,
  AgentProposalStatus,
  AgentRole,
  AgentSkillPackId,
  AgentThreadDetail
} from '../../shared/archiveContracts'
import {
  type CreateProposalInput
} from './objectivePersistenceService'
import type { ArchiveDatabase } from './db'

type ExternalVerificationBrokerService = ReturnType<typeof createExternalVerificationBrokerService>
type SubagentRegistryService = ReturnType<typeof createSubagentRegistryService>
type RunMemoryWorkspaceCompareService = typeof runMemoryWorkspaceCompare
type AskMemoryWorkspacePersistedService = typeof askMemoryWorkspacePersisted
type ListAgentPolicyVersionsService = typeof listAgentPolicyVersions
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

  function asErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message
    }

    return String(error)
  }

  const toolExecutionService = createObjectiveSubagentToolExecutionService({
    db
  })

  function parseWebVerifierPayload(payload: Record<string, unknown>) {
    const claim = typeof payload.claim === 'string' ? payload.claim.trim() : ''
    const query = typeof payload.query === 'string' ? payload.query.trim() : ''
    const localEvidenceFileId = typeof payload.localEvidenceFileId === 'string'
      ? payload.localEvidenceFileId.trim()
      : ''

    if (!claim || !query) {
      throw new Error('web-verifier payload requires non-empty claim and query')
    }

    return {
      claim,
      query,
      localEvidenceFileId: localEvidenceFileId || null
    }
  }

  function parseEvidenceCheckerPayload(payload: Record<string, unknown>) {
    const fileId = typeof payload.fileId === 'string' ? payload.fileId.trim() : ''
    const crossCheckClaim = typeof payload.crossCheckClaim === 'string'
      ? payload.crossCheckClaim.trim()
      : ''
    const crossCheckQuery = typeof payload.crossCheckQuery === 'string'
      ? payload.crossCheckQuery.trim()
      : ''

    if (!fileId) {
      throw new Error('evidence-checker payload requires non-empty fileId')
    }

    if ((crossCheckClaim && !crossCheckQuery) || (!crossCheckClaim && crossCheckQuery)) {
      throw new Error('evidence-checker payload requires both crossCheckClaim and crossCheckQuery when either is provided')
    }

    return {
      fileId,
      crossCheckClaim: crossCheckClaim || null,
      crossCheckQuery: crossCheckQuery || null
    }
  }

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

  type ActiveSubagentExecutionContext = ReturnType<typeof lifecycleService.startRegisteredSubagentExecution> & {
    toolPolicyId: string
    remainingBudget: {
      maxRounds: number
      maxToolCalls: number
      timeoutMs: number
    }
    skillPackIds: readonly AgentSkillPackId[]
    runTool: <T>(input: {
      toolName: string
      inputPayload: Record<string, unknown>
      run: () => Promise<{
        result: T
        outputPayload: Record<string, unknown>
        artifactRefs?: AgentArtifactRef[]
      }>
    }) => Promise<T>
  }

  type RegisteredSubagentOutcome<TExtra extends Record<string, unknown> = Record<never, never>> = {
    summary: string
    refs: AgentArtifactRef[]
    checkpointKind: 'tool_action_executed' | 'external_verification_completed' | 'user_facing_result_prepared'
    checkpointTitle: string
    checkpointSummary: string
  } & TExtra

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

  async function runWebVerifierSubagent(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    claim: string
    query: string
    localEvidenceFileId?: string | null
  }) {
    const title = `Web verification · ${input.claim.slice(0, 60)}`
    return executeRegisteredSubagent({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'web-verifier',
      title,
      goalBody: `Verify the external claim "${input.claim}" using the bounded query "${input.query}".`,
      spawnSummary: `Spawned web-verifier in subthread ${title} for bounded external verification.`,
      failureLabel: 'Web verifier',
      run: async ({ subthread, createdSubagent, runTool }) => {
        return runWebVerifierWorkflow({
          proposal: input.proposal,
          subthreadThreadId: subthread.threadId,
          subagentId: createdSubagent.subagentId,
          claim: input.claim,
          query: input.query,
          localEvidenceFileId: input.localEvidenceFileId,
          runTool,
          appendRuntimeMessage: dependencies.helpers.appendRuntimeMessage,
          externalVerificationBroker: dependencies.externalVerificationBroker,
          delegateSubagentFromRunner: delegationService.delegateSubagentFromRunner
        })
      }
    })
  }

  async function runEvidenceCheckerSubagent(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    fileId: string
    crossCheckClaim?: string | null
    crossCheckQuery?: string | null
  }) {
    const title = `Evidence check · ${input.fileId}`
    return executeRegisteredSubagent({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'evidence-checker',
      title,
      goalBody: `Review local document evidence for file "${input.fileId}" and summarize approved fields, pending candidates, and the most relevant OCR excerpt.`,
      spawnSummary: `Spawned evidence-checker in subthread ${title} for bounded local evidence checking.`,
      failureLabel: 'Evidence checker',
      run: async ({ subthread, createdSubagent, runTool }) => {
        return runEvidenceCheckerWorkflow({
          db,
          proposal: input.proposal,
          subthreadThreadId: subthread.threadId,
          subagentId: createdSubagent.subagentId,
          fileId: input.fileId,
          crossCheckClaim: input.crossCheckClaim,
          crossCheckQuery: input.crossCheckQuery,
          runTool,
          appendRuntimeMessage: dependencies.helpers.appendRuntimeMessage,
          delegateSubagentFromRunner: delegationService.delegateSubagentFromRunner
        })
      }
    })
  }

  async function runCompareAnalystSubagent(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    question: string
    scope: { kind: 'global' } | { kind: 'person'; canonicalPersonId: string } | { kind: 'group'; anchorPersonId: string }
    expressionMode: 'grounded' | 'advice'
    workflowKind: 'default' | 'persona_draft_sandbox'
  }) {
    return executeRegisteredSubagent({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'compare-analyst',
      title: `Compare analysis · ${input.question.slice(0, 60)}`,
      goalBody: `Compare grounded answer candidates for "${input.question}" and summarize the most trustworthy bounded result.`,
      spawnSummary: `Spawned compare-analyst in subthread Compare analysis · ${input.question.slice(0, 60)} for bounded compare analysis.`,
      failureLabel: 'Compare analyst',
      run: async ({ subthread, createdSubagent, runTool }) => {
        return runCompareAnalystWorkflow({
          proposal: input.proposal,
          subthreadThreadId: subthread.threadId,
          subagentId: createdSubagent.subagentId,
          payload: {
            question: input.question,
            scope: input.scope,
            expressionMode: input.expressionMode,
            workflowKind: input.workflowKind
          },
          runCompare: async (payload) => (
            (dependencies.runMemoryWorkspaceCompare ?? runMemoryWorkspaceCompare)(db, {
              scope: payload.scope,
              question: payload.question,
              expressionMode: payload.expressionMode,
              workflowKind: payload.workflowKind,
              targets: [
                {
                  targetId: 'local-baseline',
                  label: 'Local baseline',
                  executionMode: 'local_baseline'
                }
              ]
            })
          ),
          runTool,
          appendRuntimeMessage: dependencies.helpers.appendRuntimeMessage
        })
      }
    })
  }

  async function runDraftComposerSubagent(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    question: string
    scope: { kind: 'global' } | { kind: 'person'; canonicalPersonId: string } | { kind: 'group'; anchorPersonId: string }
    expressionMode: 'grounded' | 'advice'
    sessionId?: string | null
  }) {
    return executeRegisteredSubagent({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'draft-composer',
      title: `Draft composition · ${input.question.slice(0, 60)}`,
      goalBody: `Prepare a reviewed simulation draft for "${input.question}" using the bounded memory workspace sandbox.`,
      spawnSummary: `Spawned draft-composer in subthread Draft composition · ${input.question.slice(0, 60)} for bounded draft composition.`,
      failureLabel: 'Draft composer',
      run: async ({ subthread, createdSubagent, runTool }) => {
        return runDraftComposerWorkflow({
          proposal: input.proposal,
          subthreadThreadId: subthread.threadId,
          subagentId: createdSubagent.subagentId,
          payload: {
            question: input.question,
            scope: input.scope,
            expressionMode: input.expressionMode,
            sessionId: input.sessionId ?? null
          },
          askWorkspace: async (payload) => (
            (dependencies.askMemoryWorkspacePersisted ?? askMemoryWorkspacePersisted)(db, {
              scope: payload.scope,
              question: payload.question,
              expressionMode: payload.expressionMode,
              workflowKind: 'persona_draft_sandbox',
              sessionId: payload.sessionId ?? undefined
            })
          ),
          runTool,
          appendRuntimeMessage: dependencies.helpers.appendRuntimeMessage
        })
      }
    })
  }

  async function runPolicyAuditorSubagent(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    policyKey: string
    role: AgentRole
  }) {
    return executeRegisteredSubagent({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'policy-auditor',
      title: `Policy audit · ${input.policyKey}`,
      goalBody: `Audit policy versions for "${input.policyKey}" and summarize the latest bounded changes before rollout.`,
      spawnSummary: `Spawned policy-auditor in subthread Policy audit · ${input.policyKey} for bounded policy auditing.`,
      failureLabel: 'Policy auditor',
      run: async ({ subthread, createdSubagent, runTool }) => {
        return runPolicyAuditorWorkflow({
          proposal: input.proposal,
          subthreadThreadId: subthread.threadId,
          subagentId: createdSubagent.subagentId,
          payload: {
            policyKey: input.policyKey,
            role: input.role
          },
          listPolicyVersions: (payload) => (
            (dependencies.listAgentPolicyVersions ?? listAgentPolicyVersions)(db, {
              role: payload.role,
              policyKey: payload.policyKey
            })
          ),
          runTool,
          appendRuntimeMessage: dependencies.helpers.appendRuntimeMessage
        })
      }
    })
  }

  const spawnSubagentRunnerRegistry = createSpawnSubagentRunnerRegistry({
    'web-verifier': {
      parsePayload: parseWebVerifierPayload,
      run: async ({ proposal, requestedByParticipantId, payload }) => runWebVerifierSubagent({
        proposal,
        requestedByParticipantId,
        claim: payload.claim,
        query: payload.query,
        localEvidenceFileId: payload.localEvidenceFileId
      })
    },
    'evidence-checker': {
      parsePayload: parseEvidenceCheckerPayload,
      run: async ({ proposal, requestedByParticipantId, payload }) => runEvidenceCheckerSubagent({
        proposal,
        requestedByParticipantId,
        fileId: payload.fileId,
        crossCheckClaim: payload.crossCheckClaim,
        crossCheckQuery: payload.crossCheckQuery
      })
    },
    'compare-analyst': {
      parsePayload: parseCompareAnalystPayload,
      run: async ({ proposal, requestedByParticipantId, payload }) => runCompareAnalystSubagent({
        proposal,
        requestedByParticipantId,
        question: payload.question,
        scope: payload.scope,
        expressionMode: payload.expressionMode,
        workflowKind: payload.workflowKind
      })
    },
    'draft-composer': {
      parsePayload: parseDraftComposerPayload,
      run: async ({ proposal, requestedByParticipantId, payload }) => runDraftComposerSubagent({
        proposal,
        requestedByParticipantId,
        question: payload.question,
        scope: payload.scope,
        expressionMode: payload.expressionMode,
        sessionId: payload.sessionId
      })
    },
    'policy-auditor': {
      parsePayload: parsePolicyAuditorPayload,
      run: async ({ proposal, requestedByParticipantId, payload }) => runPolicyAuditorSubagent({
        proposal,
        requestedByParticipantId,
        policyKey: payload.policyKey,
        role: payload.role
      })
    }
  })

  async function executeCommittedSpawnSubagentProposal(proposal: AgentProposalRecord) {
    return spawnSubagentRunnerRegistry.executeCommittedProposal(proposal)
  }

  async function autoCommitEligibleSpawnSubagentProposal(proposal: AgentProposalRecord) {
    if (
      proposal.proposalKind !== 'spawn_subagent'
      || proposal.status !== 'committable'
      || proposal.requiresOperatorConfirmation
    ) {
      return proposal
    }

    const committed = dependencies.helpers.updateProposalFromGate({
      proposalId: proposal.proposalId,
      nextStatus: 'committed'
    })

    await executeCommittedSpawnSubagentProposal(committed)

    return committed
  }

  async function requestExternalVerification(input: {
    objectiveId: string
    threadId: string
    proposedByParticipantId: string
    claim: string
    query: string
  }) {
    const verifierProfile = getSubagentProfile('web-verifier')
    const proposal = dependencies.helpers.createProposalWithCheckpoint({
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      proposedByParticipantId: input.proposedByParticipantId,
      proposalKind: 'verify_external_claim',
      payload: {
        claim: input.claim,
        query: input.query
      },
      ownerRole: 'workspace',
      status: 'under_review',
      requiredApprovals: ['workspace'],
      allowVetoBy: ['governance'],
      toolPolicyId: getRequiredToolPolicyId('web-verifier'),
      budget: { ...verifierProfile.defaultBudget }
    })
    const execution = await runWebVerifierSubagent({
      proposal,
      requestedByParticipantId: input.proposedByParticipantId,
      claim: input.claim,
      query: input.query
    })

    return {
      proposal,
      ...execution
    }
  }

  return {
    executeCommittedSpawnSubagentProposal,
    autoCommitEligibleSpawnSubagentProposal,
    requestExternalVerification
  }
}
