import type {
  CitationBundle,
  createExternalVerificationBrokerService
} from './externalVerificationBrokerService'
import type { RunnerSubagentDelegationResult } from './objectiveSubagentDelegationService'
import type { ObjectiveSubagentExecutionPlan } from './objectiveSubagentPlanningService'
import {
  runCompareAnalystWorkflow,
  runDraftComposerWorkflow,
  runPolicyAuditorWorkflow
} from './objectiveSubagentAnalysisWorkflowService'
import type { createObjectiveSubagentDelegationService } from './objectiveSubagentDelegationService'
import type { ObjectiveSubagentExecutionResult } from './objectiveSubagentRoutingService'
import {
  runEvidenceCheckerWorkflow,
  runWebVerifierWorkflow
} from './objectiveSubagentVerificationWorkflowService'
import { runMemoryWorkspaceCompare } from './memoryWorkspaceCompareService'
import { askMemoryWorkspacePersisted } from './memoryWorkspaceSessionService'
import { listAgentPolicyVersions } from './governancePersistenceService'
import type {
  AgentArtifactRef,
  AgentMessageKind,
  AgentProposalRecord,
  AgentRole,
  AgentSkillPackId
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'

type ExternalVerificationBrokerService = ReturnType<typeof createExternalVerificationBrokerService>
type DelegateSubagentFromRunner = ReturnType<typeof createObjectiveSubagentDelegationService>['delegateSubagentFromRunner']

export type RunMemoryWorkspaceCompareService = typeof runMemoryWorkspaceCompare
export type AskMemoryWorkspacePersistedService = typeof askMemoryWorkspacePersisted
export type ListAgentPolicyVersionsService = typeof listAgentPolicyVersions

type RuntimeMessageHelper = (input: {
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

export type ActiveSubagentExecutionContext = {
  subthread: {
    threadId: string
  }
  createdSubagent: {
    subagentId: string
  }
  toolPolicyId: string
  executionPlan: ObjectiveSubagentExecutionPlan
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
  delegateSubagentFromRunner: (input: {
    proposal: AgentProposalRecord
    parentSubthreadId: string
    requestedByParticipantId: string
    specialization: AgentSkillPackId
    payload: Record<string, unknown>
    approvalComment: string
  }) => Promise<RunnerSubagentDelegationResult>
}

export type RegisteredSubagentOutcome<TExtra extends Record<string, unknown> = Record<never, never>> = {
  summary: string
  refs: AgentArtifactRef[]
  checkpointKind: 'tool_action_executed' | 'external_verification_completed' | 'user_facing_result_prepared'
  checkpointTitle: string
  checkpointSummary: string
} & TExtra

export type ExecuteRegisteredSubagent = <
  TExtra extends Record<string, unknown> = Record<never, never>
>(input: {
  proposal: AgentProposalRecord
  requestedByParticipantId: string
  specialization: AgentSkillPackId
  title: string
  goalBody: string
  spawnSummary: string
  failureLabel: string
  run: (context: ActiveSubagentExecutionContext) => Promise<RegisteredSubagentOutcome<TExtra>>
}) => Promise<ObjectiveSubagentExecutionResult<TExtra>>

export function createObjectiveSubagentSpecializationService(dependencies: {
  db: ArchiveDatabase
  externalVerificationBroker: ExternalVerificationBrokerService
  runMemoryWorkspaceCompare?: RunMemoryWorkspaceCompareService
  askMemoryWorkspacePersisted?: AskMemoryWorkspacePersistedService
  listAgentPolicyVersions?: ListAgentPolicyVersionsService
  helpers: {
    appendRuntimeMessage: RuntimeMessageHelper
  }
  delegateSubagentFromRunner: DelegateSubagentFromRunner
  executeRegisteredSubagent: ExecuteRegisteredSubagent
}) {
  const { db } = dependencies

  async function runWebVerifierSubagent(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    claim: string
    query: string
    localEvidenceFileId?: string | null
  }): Promise<ObjectiveSubagentExecutionResult<{ citationBundle: CitationBundle }>> {
    const title = `Web verification · ${input.claim.slice(0, 60)}`
    return dependencies.executeRegisteredSubagent({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'web-verifier',
      title,
      goalBody: `Verify the external claim "${input.claim}" using the bounded query "${input.query}".`,
      spawnSummary: `Spawned web-verifier in subthread ${title} for bounded external verification.`,
      failureLabel: 'Web verifier',
      run: async ({ subthread, createdSubagent, runTool, delegateSubagentFromRunner }) => {
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
          delegateSubagentFromRunner
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
    return dependencies.executeRegisteredSubagent({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'evidence-checker',
      title,
      goalBody: `Review local document evidence for file "${input.fileId}" and summarize approved fields, pending candidates, and the most relevant OCR excerpt.`,
      spawnSummary: `Spawned evidence-checker in subthread ${title} for bounded local evidence checking.`,
      failureLabel: 'Evidence checker',
      run: async ({ subthread, createdSubagent, runTool, delegateSubagentFromRunner }) => {
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
          delegateSubagentFromRunner
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
    const title = `Compare analysis · ${input.question.slice(0, 60)}`
    return dependencies.executeRegisteredSubagent({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'compare-analyst',
      title,
      goalBody: `Compare grounded answer candidates for "${input.question}" and summarize the most trustworthy bounded result.`,
      spawnSummary: `Spawned compare-analyst in subthread ${title} for bounded compare analysis.`,
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
    const title = `Draft composition · ${input.question.slice(0, 60)}`
    return dependencies.executeRegisteredSubagent({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'draft-composer',
      title,
      goalBody: `Prepare a reviewed simulation draft for "${input.question}" using the bounded memory workspace sandbox.`,
      spawnSummary: `Spawned draft-composer in subthread ${title} for bounded draft composition.`,
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
    const title = `Policy audit · ${input.policyKey}`
    return dependencies.executeRegisteredSubagent({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'policy-auditor',
      title,
      goalBody: `Audit policy versions for "${input.policyKey}" and summarize the latest bounded changes before rollout.`,
      spawnSummary: `Spawned policy-auditor in subthread ${title} for bounded policy auditing.`,
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

  return {
    runWebVerifierSubagent,
    runEvidenceCheckerSubagent,
    runCompareAnalystSubagent,
    runDraftComposerSubagent,
    runPolicyAuditorSubagent
  }
}
