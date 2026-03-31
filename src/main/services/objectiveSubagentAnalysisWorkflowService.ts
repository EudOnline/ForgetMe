import {
  runCompareAnalystTask,
  type CompareAnalystPayload,
  type CompareSessionResult
} from './subagentRunners/compareAnalystRunner'
import {
  runDraftComposerTask,
  type DraftComposerPayload,
  type DraftWorkspaceTurn
} from './subagentRunners/draftComposerRunner'
import {
  runPolicyAuditorTask,
  type PolicyAuditorPayload,
  type PolicyVersionSnapshot
} from './subagentRunners/policyAuditorRunner'
import type {
  AgentArtifactRef,
  AgentMessageKind,
  AgentProposalRecord
} from '../../shared/archiveContracts'

type AppendRuntimeMessage = (input: {
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

type RunTool = <T>(input: {
  toolName: string
  inputPayload: Record<string, unknown>
  run: () => Promise<{
    result: T
    outputPayload: Record<string, unknown>
    artifactRefs?: AgentArtifactRef[]
  }>
}) => Promise<T>

function appendToolResultMessage(input: {
  proposal: AgentProposalRecord
  subthreadThreadId: string
  subagentId: string
  appendRuntimeMessage: AppendRuntimeMessage
  body: string
  refs?: AgentArtifactRef[]
}) {
  input.appendRuntimeMessage({
    objectiveId: input.proposal.objectiveId,
    threadId: input.subthreadThreadId,
    fromParticipantId: input.subagentId,
    kind: 'tool_result',
    body: input.body,
    refs: input.refs
  })
}

export async function runCompareAnalystWorkflow(input: {
  proposal: AgentProposalRecord
  subthreadThreadId: string
  subagentId: string
  payload: CompareAnalystPayload
  runCompare: (payload: CompareAnalystPayload) => Promise<CompareSessionResult | null>
  runTool: RunTool
  appendRuntimeMessage: AppendRuntimeMessage
}) {
  const outcome = await runCompareAnalystTask({
    payload: input.payload,
    runCompare: input.runCompare,
    runTool: input.runTool
  })

  appendToolResultMessage({
    proposal: input.proposal,
    subthreadThreadId: input.subthreadThreadId,
    subagentId: input.subagentId,
    appendRuntimeMessage: input.appendRuntimeMessage,
    body: `Started compare analysis for "${input.payload.question}" and prepared compare session artifacts.`,
    refs: outcome.artifactRefs
  })
  appendToolResultMessage({
    proposal: input.proposal,
    subthreadThreadId: input.subthreadThreadId,
    subagentId: input.subagentId,
    appendRuntimeMessage: input.appendRuntimeMessage,
    body: outcome.summary,
    refs: outcome.artifactRefs
  })

  return {
    summary: outcome.summary,
    refs: outcome.artifactRefs,
    checkpointKind: 'tool_action_executed' as const,
    checkpointTitle: 'Compare analysis completed',
    checkpointSummary: `Compare analyst summarized compare results for "${input.payload.question}".`,
    compare: outcome
  }
}

export async function runDraftComposerWorkflow(input: {
  proposal: AgentProposalRecord
  subthreadThreadId: string
  subagentId: string
  payload: DraftComposerPayload
  askWorkspace: (payload: DraftComposerPayload) => Promise<DraftWorkspaceTurn | null>
  runTool: RunTool
  appendRuntimeMessage: AppendRuntimeMessage
}) {
  const outcome = await runDraftComposerTask({
    payload: input.payload,
    askWorkspace: input.askWorkspace,
    runTool: input.runTool
  })

  appendToolResultMessage({
    proposal: input.proposal,
    subthreadThreadId: input.subthreadThreadId,
    subagentId: input.subagentId,
    appendRuntimeMessage: input.appendRuntimeMessage,
    body: `Draft composer loaded a workspace turn for "${input.payload.question}".`,
    refs: outcome.artifactRefs
  })
  appendToolResultMessage({
    proposal: input.proposal,
    subthreadThreadId: input.subthreadThreadId,
    subagentId: input.subagentId,
    appendRuntimeMessage: input.appendRuntimeMessage,
    body: 'Draft composer prepared a review-ready simulation draft.'
  })

  return {
    summary: outcome.summary,
    refs: outcome.artifactRefs,
    checkpointKind: 'user_facing_result_prepared' as const,
    checkpointTitle: 'Draft composition completed',
    checkpointSummary: `Draft composer prepared a review-ready draft for "${input.payload.question}".`,
    draft: outcome
  }
}

export async function runPolicyAuditorWorkflow(input: {
  proposal: AgentProposalRecord
  subthreadThreadId: string
  subagentId: string
  payload: PolicyAuditorPayload
  listPolicyVersions: (payload: PolicyAuditorPayload) => PolicyVersionSnapshot[]
  runTool: RunTool
  appendRuntimeMessage: AppendRuntimeMessage
}) {
  const outcome = await runPolicyAuditorTask({
    payload: input.payload,
    listPolicyVersions: input.listPolicyVersions,
    runTool: input.runTool
  })

  appendToolResultMessage({
    proposal: input.proposal,
    subthreadThreadId: input.subthreadThreadId,
    subagentId: input.subagentId,
    appendRuntimeMessage: input.appendRuntimeMessage,
    body: `Policy auditor loaded bounded policy versions for ${input.payload.policyKey}.`,
    refs: outcome.artifactRefs
  })
  appendToolResultMessage({
    proposal: input.proposal,
    subthreadThreadId: input.subthreadThreadId,
    subagentId: input.subagentId,
    appendRuntimeMessage: input.appendRuntimeMessage,
    body: outcome.summary,
    refs: outcome.artifactRefs
  })

  return {
    summary: outcome.summary,
    refs: outcome.artifactRefs,
    checkpointKind: 'tool_action_executed' as const,
    checkpointTitle: 'Policy audit completed',
    checkpointSummary: `Policy auditor summarized policy changes for ${input.payload.policyKey}.`,
    policyAudit: outcome
  }
}
