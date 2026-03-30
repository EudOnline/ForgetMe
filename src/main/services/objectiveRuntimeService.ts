import { evaluateProposalGate } from './agentProposalGateService'
import { buildProposalCheckpoint } from './agentCheckpointService'
import type { createExternalVerificationBrokerService } from './externalVerificationBrokerService'
import { getDocumentEvidence } from './enrichmentReadService'
import type { createSubagentRegistryService } from './subagentRegistryService'
import { createSpawnSubagentRunnerRegistry } from './spawnSubagentRunnerRegistryService'
import { authorizeToolRequest, resolveToolPolicy } from './toolBrokerService'
import type {
  AgentArtifactRef,
  AgentParticipantKind,
  AgentProposalRecord,
  AgentProposalStatus,
  AgentRole,
  AgentSkillPackId,
  AgentThreadDetail,
  ConfirmAgentProposalInput,
  ListAgentObjectivesInput,
  RespondToAgentProposalInput
} from '../../shared/archiveContracts'
import {
  addThreadParticipants,
  appendAgentMessageV2,
  createCheckpoint,
  listObjectives,
  createProposal,
  createSubagent,
  createSubthread,
  createToolExecution,
  getObjectiveDetail,
  getProposal,
  getThreadDetail,
  recordProposalVote,
  updateSubagent,
  updateThreadStatus,
  updateToolExecution,
  updateProposalStatus,
  type AgentObjectiveDetail,
  type CreateProposalInput
} from './objectivePersistenceService'
import type { ArchiveDatabase } from './db'
import type { createFacilitatorAgentService } from './agents/facilitatorAgentService'

type FacilitatorService = ReturnType<typeof createFacilitatorAgentService>
type ExternalVerificationBrokerService = ReturnType<typeof createExternalVerificationBrokerService>
type SubagentRegistryService = ReturnType<typeof createSubagentRegistryService>
type NestedSubagentExecutionResult = {
  subagent: {
    summary: string | null
  }
  subthread: {
    threadId: string
  }
}
type RunnerSubagentDelegationResult = {
  proposal: AgentProposalRecord
  execution: NestedSubagentExecutionResult
  summary: string | null
  refs: AgentArtifactRef[]
  specialization: AgentSkillPackId
}

export type ObjectiveRuntimeDependencies = {
  db: ArchiveDatabase
  facilitator: FacilitatorService
  externalVerificationBroker: ExternalVerificationBrokerService
  subagentRegistry: SubagentRegistryService
}

export function createObjectiveRuntimeService(dependencies: ObjectiveRuntimeDependencies) {
  const { db } = dependencies

  function asErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message
    }

    return String(error)
  }

  function createProposalWithCheckpoint(input: CreateProposalInput) {
    const proposal = createProposal(db, input)
    const checkpoint = buildProposalCheckpoint({
      proposal,
      nextStatus: proposal.status,
      createdAt: proposal.createdAt
    })

    createCheckpoint(db, {
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      checkpointKind: checkpoint.checkpointKind,
      title: checkpoint.title,
      summary: checkpoint.summary,
      relatedMessageId: checkpoint.relatedMessageId,
      relatedProposalId: checkpoint.relatedProposalId,
      artifactRefs: checkpoint.artifactRefs,
      createdAt: checkpoint.createdAt
    })

    return proposal
  }

  function loadProposalRuntimeState(proposalId: string) {
    const proposal = getProposal(db, { proposalId })
    if (!proposal) {
      throw new Error(`proposal not found: ${proposalId}`)
    }

    const threadDetail = getThreadDetail(db, { threadId: proposal.threadId })
    if (!threadDetail) {
      throw new Error(`thread not found: ${proposal.threadId}`)
    }

    return {
      proposal,
      votes: threadDetail.votes.filter((vote) => vote.proposalId === proposalId),
      messages: threadDetail.messages
    }
  }

  function writeStatusCheckpoint(proposalId: string, nextStatus: ReturnType<typeof evaluateProposalGate>['status'], messageId?: string) {
    const proposal = getProposal(db, { proposalId })
    if (!proposal) {
      throw new Error(`proposal not found: ${proposalId}`)
    }

    const checkpoint = buildProposalCheckpoint({
      proposal,
      nextStatus,
      messageId
    })

    createCheckpoint(db, {
      objectiveId: proposal.objectiveId,
      threadId: proposal.threadId,
      checkpointKind: checkpoint.checkpointKind,
      title: checkpoint.title,
      summary: checkpoint.summary,
      relatedMessageId: checkpoint.relatedMessageId,
      relatedProposalId: checkpoint.relatedProposalId,
      artifactRefs: checkpoint.artifactRefs,
      createdAt: checkpoint.createdAt
    })
  }

  function updateProposalFromGate(input: {
    proposalId: string
    nextStatus: AgentProposalStatus
    messageId?: string
  }) {
    const updated = updateProposalStatus(db, {
      proposalId: input.proposalId,
      status: input.nextStatus
    })
    if (!updated) {
      throw new Error(`failed to update proposal: ${input.proposalId}`)
    }

    writeStatusCheckpoint(input.proposalId, input.nextStatus, input.messageId)

    return updated
  }

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
    kind: 'goal' | 'tool_result' | 'final_response' | 'evidence_response' | 'decision'
    body: string
    refs?: AgentArtifactRef[]
  }) {
    return appendAgentMessageV2(db, {
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      fromParticipantId: input.fromParticipantId,
      toParticipantId: input.toParticipantId,
      kind: input.kind,
      body: input.body,
      refs: input.refs,
      round: nextRound(input.threadId)
    })
  }

  async function runAuthorizedTool<T>(input: {
    objectiveId: string
    threadId: string
    proposalId: string
    requestedByParticipantId: string
    role: AgentRole
    toolName: string
    toolPolicyId: string
    skillPackIds: readonly AgentSkillPackId[]
    remainingBudget: {
      maxRounds: number
      maxToolCalls: number
      timeoutMs: number
    }
    inputPayload: Record<string, unknown>
    run: () => Promise<{
      result: T
      outputPayload: Record<string, unknown>
      artifactRefs?: AgentArtifactRef[]
    }>
  }) {
    const toolPolicy = resolveToolPolicy(input.toolPolicyId) ?? undefined
    const authorization = authorizeToolRequest({
      role: input.role,
      toolName: input.toolName,
      skillPackIds: [...input.skillPackIds],
      toolPolicy,
      remainingBudget: input.remainingBudget
    })

    if (authorization.status === 'blocked') {
      createToolExecution(db, {
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        proposalId: input.proposalId,
        requestedByParticipantId: input.requestedByParticipantId,
        toolName: input.toolName,
        toolPolicyId: input.toolPolicyId,
        status: 'blocked',
        inputPayload: input.inputPayload,
        outputPayload: {
          reason: authorization.reason
        },
        completedAt: new Date().toISOString()
      })
      throw new Error(authorization.reason)
    }

    const execution = createToolExecution(db, {
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      proposalId: input.proposalId,
      requestedByParticipantId: input.requestedByParticipantId,
      toolName: input.toolName,
      toolPolicyId: input.toolPolicyId,
      status: 'authorized',
      inputPayload: input.inputPayload
    })

    try {
      const outcome = await input.run()
      const updated = updateToolExecution(db, {
        toolExecutionId: execution.toolExecutionId,
        status: 'completed',
        outputPayload: outcome.outputPayload,
        artifactRefs: outcome.artifactRefs ?? []
      })
      if (!updated) {
        throw new Error(`failed to complete tool execution: ${execution.toolExecutionId}`)
      }

      input.remainingBudget.maxToolCalls = Math.max(0, input.remainingBudget.maxToolCalls - 1)
      return outcome.result
    } catch (error) {
      updateToolExecution(db, {
        toolExecutionId: execution.toolExecutionId,
        status: 'failed',
        outputPayload: {
          message: asErrorMessage(error)
        }
      })
      throw error
    }
  }

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

  function buildChildSubthreadParticipants(input: {
    parentThreadId: string
    requestedByParticipantId: string
    ownerRole: AgentRole
    childSubagentId: string
    childDisplayLabel: string
  }) {
    const parentThread = getThreadDetail(db, { threadId: input.parentThreadId })
    const requester = parentThread?.participants.find((participant) => (
      participant.participantId === input.requestedByParticipantId
    ))

    if (!requester && input.requestedByParticipantId !== input.ownerRole) {
      throw new Error(`requesting participant not found in parent thread: ${input.requestedByParticipantId}`)
    }

    const participants = [] as Array<{
      participantKind: AgentParticipantKind
      participantId: string
      role: AgentRole | null
      displayLabel: string
    }>

    const pushParticipant = (participant: {
      participantKind: AgentParticipantKind
      participantId: string
      role: AgentRole | null
      displayLabel: string
    }) => {
      if (participants.some((candidate) => candidate.participantId === participant.participantId)) {
        return
      }

      participants.push(participant)
    }

    if (requester) {
      pushParticipant({
        participantKind: requester.participantKind,
        participantId: requester.participantId,
        role: requester.role,
        displayLabel: requester.displayLabel
      })
    } else {
      pushParticipant({
        participantKind: 'role',
        participantId: input.ownerRole,
        role: input.ownerRole,
        displayLabel: input.ownerRole
      })
    }

    pushParticipant({
      participantKind: 'role',
      participantId: input.ownerRole,
      role: input.ownerRole,
      displayLabel: input.ownerRole
    })
    pushParticipant({
      participantKind: 'subagent',
      participantId: input.childSubagentId,
      role: null,
      displayLabel: input.childDisplayLabel
    })

    return participants
  }

  async function approveNestedSpawnSubagentProposal(input: {
    objectiveId: string
    threadId: string
    proposedByParticipantId: string
    ownerRole: AgentRole
    payload: Record<string, unknown>
    toolPolicyId: string
    budget: {
      maxRounds: number
      maxToolCalls: number
      timeoutMs: number
    }
    approvalComment: string
  }) {
    const proposal = createProposalWithCheckpoint({
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      proposedByParticipantId: input.proposedByParticipantId,
      proposalKind: 'spawn_subagent',
      payload: input.payload,
      ownerRole: input.ownerRole,
      status: 'under_review',
      requiredApprovals: [input.ownerRole],
      allowVetoBy: ['governance'],
      requiresOperatorConfirmation: false,
      toolPolicyId: input.toolPolicyId,
      budget: input.budget
    })

    recordProposalVote(db, {
      objectiveId: input.objectiveId,
      threadId: input.threadId,
      proposalId: proposal.proposalId,
      voterRole: input.ownerRole,
      vote: 'approve',
      comment: input.approvalComment
    })

    const runtimeState = loadProposalRuntimeState(proposal.proposalId)
    const gate = evaluateProposalGate({
      proposal: runtimeState.proposal,
      votes: runtimeState.votes,
      messages: runtimeState.messages
    })

    const updated = updateProposalFromGate({
      proposalId: proposal.proposalId,
      nextStatus: gate.status
    })

    if (updated.status !== 'committable' && updated.status !== 'committed') {
      throw new Error(`Nested spawn_subagent proposal did not become executable: ${updated.status}`)
    }

    const committed = updated.status === 'committed'
      ? updated
      : updateProposalFromGate({
        proposalId: updated.proposalId,
        nextStatus: 'committed'
      })

    const execution = await executeCommittedSpawnSubagentProposal(committed)

    return {
      proposal: committed,
      execution
    }
  }

  async function delegateSubagentFromRunner(input: {
    proposal: AgentProposalRecord
    parentSubthreadId: string
    requestedByParticipantId: string
    specialization: AgentSkillPackId
    payload: Record<string, unknown>
    approvalComment: string
  }): Promise<RunnerSubagentDelegationResult> {
    const spawnSpec = dependencies.subagentRegistry.buildSpawnSubagentSpec({
      specialization: input.specialization,
      payload: input.payload
    })

    if (!spawnSpec.toolPolicyId) {
      throw new Error(`Nested delegation requires a tool policy for ${input.specialization}`)
    }

    appendRuntimeMessage({
      objectiveId: input.proposal.objectiveId,
      threadId: input.parentSubthreadId,
      fromParticipantId: input.requestedByParticipantId,
      kind: 'decision',
      body: `Nested delegation requested: ${input.specialization}.`
    })

    const nestedDelegation = await approveNestedSpawnSubagentProposal({
      objectiveId: input.proposal.objectiveId,
      threadId: input.parentSubthreadId,
      proposedByParticipantId: input.requestedByParticipantId,
      ownerRole: input.proposal.ownerRole,
      payload: spawnSpec.payload,
      toolPolicyId: spawnSpec.toolPolicyId,
      budget: spawnSpec.budget,
      approvalComment: input.approvalComment
    })

    const execution = nestedDelegation.execution as NestedSubagentExecutionResult | null
    if (!execution) {
      throw new Error(`Nested delegation execution missing for ${input.specialization}`)
    }

    const childThread = getThreadDetail(db, {
      threadId: execution.subthread.threadId
    })
    const finalResponse = childThread?.messages
      .slice()
      .reverse()
      .find((message) => message.kind === 'final_response')
    const refs = [...(finalResponse?.refs ?? [])]
    const summary = execution.subagent.summary ?? null

    appendRuntimeMessage({
      objectiveId: input.proposal.objectiveId,
      threadId: input.parentSubthreadId,
      fromParticipantId: input.requestedByParticipantId,
      kind: 'tool_result',
      body: summary
        ? `Nested delegation completed: ${input.specialization}. Summary: ${summary}`
        : `Nested delegation completed: ${input.specialization}. No summary returned.`,
      refs
    })

    return {
      proposal: nestedDelegation.proposal,
      execution,
      summary,
      refs,
      specialization: input.specialization
    }
  }

  async function runWebVerifierSubagent(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    claim: string
    query: string
    localEvidenceFileId?: string | null
  }) {
    const verifierProfile = getSubagentProfile('web-verifier')
    const toolPolicyId = input.proposal.toolPolicyId ?? getRequiredToolPolicyId('web-verifier')
    const executionBudget = input.proposal.budget ?? { ...verifierProfile.defaultBudget }
    const remainingBudget = {
      ...executionBudget
    }
    const subthread = createSubthread(db, {
      objectiveId: input.proposal.objectiveId,
      parentThreadId: input.proposal.threadId,
      ownerRole: input.proposal.ownerRole,
      title: `Web verification · ${input.claim.slice(0, 60)}`,
      status: 'open'
    })

    const registeredSubagent = dependencies.subagentRegistry.createSubagent({
      objectiveId: input.proposal.objectiveId,
      threadId: subthread.threadId,
      parentThreadId: input.proposal.threadId,
      parentAgentRole: input.proposal.ownerRole,
      specialization: 'web-verifier',
      budget: { ...executionBudget }
    })

    addThreadParticipants(db, {
      objectiveId: input.proposal.objectiveId,
      threadId: input.proposal.threadId,
      invitedByParticipantId: input.requestedByParticipantId,
      participants: [
        {
          participantKind: 'subagent',
          participantId: registeredSubagent.subagentId,
          role: null,
          displayLabel: registeredSubagent.specialization
        }
      ]
    })

    addThreadParticipants(db, {
      objectiveId: input.proposal.objectiveId,
      threadId: subthread.threadId,
      invitedByParticipantId: input.requestedByParticipantId,
      participants: buildChildSubthreadParticipants({
        parentThreadId: input.proposal.threadId,
        requestedByParticipantId: input.requestedByParticipantId,
        ownerRole: input.proposal.ownerRole,
        childSubagentId: registeredSubagent.subagentId,
        childDisplayLabel: registeredSubagent.specialization
      })
    })

    const createdSubagent = createSubagent(db, {
      subagentId: registeredSubagent.subagentId,
      objectiveId: registeredSubagent.objectiveId,
      threadId: subthread.threadId,
      parentThreadId: registeredSubagent.parentThreadId,
      parentAgentRole: registeredSubagent.parentAgentRole,
      specialization: registeredSubagent.specialization,
      skillPackIds: registeredSubagent.skillPackIds,
      toolPolicyId,
      budget: registeredSubagent.budget,
      expectedOutputSchema: registeredSubagent.outputSchema,
      status: 'running'
    })

    createCheckpoint(db, {
      objectiveId: input.proposal.objectiveId,
      threadId: input.proposal.threadId,
      checkpointKind: 'subagent_spawned',
      title: 'Subagent spawned',
      summary: `Spawned ${createdSubagent.specialization} in subthread ${subthread.title} for bounded external verification.`,
      relatedProposalId: input.proposal.proposalId
    })

    appendRuntimeMessage({
      objectiveId: input.proposal.objectiveId,
      threadId: subthread.threadId,
      fromParticipantId: input.requestedByParticipantId,
      toParticipantId: createdSubagent.subagentId,
      kind: 'goal',
      body: `Verify the external claim "${input.claim}" using the bounded query "${input.query}".`
    })

    try {
      const searchResults = await runAuthorizedTool({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        proposalId: input.proposal.proposalId,
        requestedByParticipantId: createdSubagent.subagentId,
        role: input.proposal.ownerRole,
        toolName: 'search_web',
        toolPolicyId,
        skillPackIds: verifierProfile.skillPackIds,
        remainingBudget,
        inputPayload: {
          claim: input.claim,
          query: input.query,
          maxResults: 1
        },
        run: async () => {
          const results = await dependencies.externalVerificationBroker.searchClaimSources({
            claim: input.claim,
            query: input.query,
            maxResults: 1
          })

          return {
            result: results,
            outputPayload: {
              resultCount: results.length,
              urls: results.map((candidate) => candidate.url)
            },
            artifactRefs: results.map((candidate) => ({
              kind: 'external_citation_bundle',
              id: candidate.url,
              label: candidate.title
            }))
          }
        }
      })

      appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'tool_result',
        body: `Searched the web and found ${searchResults.length} candidate source${searchResults.length === 1 ? '' : 's'}.`,
        refs: searchResults.map((candidate) => ({
          kind: 'external_citation_bundle',
          id: candidate.url,
          label: candidate.title
        }))
      })

      const sources = [] as Awaited<ReturnType<ExternalVerificationBrokerService['openClaimSource']>>[]

      for (const candidate of searchResults) {
        const source = await runAuthorizedTool({
          objectiveId: input.proposal.objectiveId,
          threadId: subthread.threadId,
          proposalId: input.proposal.proposalId,
          requestedByParticipantId: createdSubagent.subagentId,
          role: input.proposal.ownerRole,
          toolName: 'open_source_page',
          toolPolicyId,
          skillPackIds: verifierProfile.skillPackIds,
          remainingBudget,
          inputPayload: {
            url: candidate.url
          },
          run: async () => {
            const openedSource = await dependencies.externalVerificationBroker.openClaimSource({
              claim: input.claim,
              candidate
            })

            return {
              result: openedSource,
              outputPayload: {
                url: openedSource.url,
                title: openedSource.title,
                publishedAt: openedSource.publishedAt,
                extractedFact: openedSource.extractedFact
              },
              artifactRefs: [
                {
                  kind: 'external_citation_bundle',
                  id: openedSource.url,
                  label: openedSource.title
                }
              ]
            }
          }
        })
        sources.push(source)
      }

      appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'tool_result',
        body: sources[0]
          ? `Opened source "${sources[0].title}" and extracted: ${sources[0].extractedFact}`
          : 'No source pages could be opened successfully.',
        refs: sources.map((source) => ({
          kind: 'external_citation_bundle',
          id: source.url,
          label: source.title
        }))
      })

      const citationBundle = await runAuthorizedTool({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        proposalId: input.proposal.proposalId,
        requestedByParticipantId: createdSubagent.subagentId,
        role: input.proposal.ownerRole,
        toolName: 'capture_citation_bundle',
        toolPolicyId,
        skillPackIds: verifierProfile.skillPackIds,
        remainingBudget,
        inputPayload: {
          claim: input.claim,
          sourceCount: sources.length
        },
        run: async () => {
          const bundle = await dependencies.externalVerificationBroker.buildCitationBundle({
            claim: input.claim,
            sources
          })

          return {
            result: bundle,
            outputPayload: {
              verdict: bundle.verdict,
              sourceCount: bundle.sources.length
            },
            artifactRefs: bundle.sources.map((source) => ({
              kind: 'external_citation_bundle',
              id: source.url,
              label: source.title
            }))
          }
        }
      })

      appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'tool_result',
        body: `Captured a citation bundle with verdict ${citationBundle.verdict}.`,
        refs: citationBundle.sources.map((source) => ({
          kind: 'external_citation_bundle',
          id: source.url,
          label: source.title
        }))
      })

      let localEvidenceSummary: string | null = null

      if (input.localEvidenceFileId) {
        const nestedDelegation = await delegateSubagentFromRunner({
          proposal: input.proposal,
          parentSubthreadId: subthread.threadId,
          requestedByParticipantId: createdSubagent.subagentId,
          specialization: 'evidence-checker',
          payload: {
            fileId: input.localEvidenceFileId
          },
          approvalComment: 'Owner auto-approved nested local evidence delegation within the committed verifier scope.'
        })
        localEvidenceSummary = nestedDelegation.summary
      }

      const summary = localEvidenceSummary
        ? `Web verifier finished with verdict ${citationBundle.verdict} from ${citationBundle.sources.length} source${citationBundle.sources.length === 1 ? '' : 's'}. Local evidence: ${localEvidenceSummary}`
        : `Web verifier finished with verdict ${citationBundle.verdict} from ${citationBundle.sources.length} source${citationBundle.sources.length === 1 ? '' : 's'}.`

      appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'final_response',
        body: summary,
        refs: citationBundle.sources.map((source) => ({
          kind: 'external_citation_bundle',
          id: source.url,
          label: source.title
        }))
      })

      appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: input.proposal.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'evidence_response',
        body: summary,
        refs: citationBundle.sources.map((source) => ({
          kind: 'external_citation_bundle',
          id: source.url,
          label: source.title
        }))
      })

      const completedSubagent = updateSubagent(db, {
        subagentId: createdSubagent.subagentId,
        status: 'completed',
        summary
      })
      const completedSubthread = updateThreadStatus(db, {
        threadId: subthread.threadId,
        status: 'completed'
      })

      createCheckpoint(db, {
        objectiveId: input.proposal.objectiveId,
        threadId: input.proposal.threadId,
        checkpointKind: 'external_verification_completed',
        title: 'External verification completed',
        summary: `Verification verdict: ${citationBundle.verdict}.`,
        relatedProposalId: input.proposal.proposalId,
        artifactRefs: citationBundle.sources.map((source) => ({
          kind: 'external_citation_bundle',
          id: source.url,
          label: source.title
        }))
      })

      return {
        subagent: completedSubagent ?? createdSubagent,
        subthread: completedSubthread ?? subthread,
        citationBundle
      }
    } catch (error) {
      updateSubagent(db, {
        subagentId: createdSubagent.subagentId,
        status: 'failed',
        summary: `Web verifier failed: ${asErrorMessage(error)}`
      })
      updateThreadStatus(db, {
        threadId: subthread.threadId,
        status: 'blocked'
      })
      throw error
    }
  }

  async function runEvidenceCheckerSubagent(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    fileId: string
    crossCheckClaim?: string | null
    crossCheckQuery?: string | null
  }) {
    const evidenceCheckerProfile = getSubagentProfile('evidence-checker')
    const toolPolicyId = input.proposal.toolPolicyId ?? getRequiredToolPolicyId('evidence-checker')
    const executionBudget = input.proposal.budget ?? { ...evidenceCheckerProfile.defaultBudget }
    const remainingBudget = {
      ...executionBudget
    }
    const subthread = createSubthread(db, {
      objectiveId: input.proposal.objectiveId,
      parentThreadId: input.proposal.threadId,
      ownerRole: input.proposal.ownerRole,
      title: `Evidence check · ${input.fileId}`,
      status: 'open'
    })

    const registeredSubagent = dependencies.subagentRegistry.createSubagent({
      objectiveId: input.proposal.objectiveId,
      threadId: subthread.threadId,
      parentThreadId: input.proposal.threadId,
      parentAgentRole: input.proposal.ownerRole,
      specialization: 'evidence-checker',
      budget: { ...executionBudget }
    })

    addThreadParticipants(db, {
      objectiveId: input.proposal.objectiveId,
      threadId: input.proposal.threadId,
      invitedByParticipantId: input.requestedByParticipantId,
      participants: [
        {
          participantKind: 'subagent',
          participantId: registeredSubagent.subagentId,
          role: null,
          displayLabel: registeredSubagent.specialization
        }
      ]
    })

    addThreadParticipants(db, {
      objectiveId: input.proposal.objectiveId,
      threadId: subthread.threadId,
      invitedByParticipantId: input.requestedByParticipantId,
      participants: buildChildSubthreadParticipants({
        parentThreadId: input.proposal.threadId,
        requestedByParticipantId: input.requestedByParticipantId,
        ownerRole: input.proposal.ownerRole,
        childSubagentId: registeredSubagent.subagentId,
        childDisplayLabel: registeredSubagent.specialization
      })
    })

    const createdSubagent = createSubagent(db, {
      subagentId: registeredSubagent.subagentId,
      objectiveId: registeredSubagent.objectiveId,
      threadId: subthread.threadId,
      parentThreadId: registeredSubagent.parentThreadId,
      parentAgentRole: registeredSubagent.parentAgentRole,
      specialization: registeredSubagent.specialization,
      skillPackIds: registeredSubagent.skillPackIds,
      toolPolicyId,
      budget: registeredSubagent.budget,
      expectedOutputSchema: registeredSubagent.outputSchema,
      status: 'running'
    })

    createCheckpoint(db, {
      objectiveId: input.proposal.objectiveId,
      threadId: input.proposal.threadId,
      checkpointKind: 'subagent_spawned',
      title: 'Subagent spawned',
      summary: `Spawned ${createdSubagent.specialization} in subthread ${subthread.title} for bounded local evidence checking.`,
      relatedProposalId: input.proposal.proposalId
    })

    appendRuntimeMessage({
      objectiveId: input.proposal.objectiveId,
      threadId: subthread.threadId,
      fromParticipantId: input.requestedByParticipantId,
      toParticipantId: createdSubagent.subagentId,
      kind: 'goal',
      body: `Review local document evidence for file "${input.fileId}" and summarize approved fields, pending candidates, and the most relevant OCR excerpt.`
    })

    try {
      const evidence = await runAuthorizedTool({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        proposalId: input.proposal.proposalId,
        requestedByParticipantId: createdSubagent.subagentId,
        role: input.proposal.ownerRole,
        toolName: 'get_document_evidence',
        toolPolicyId,
        skillPackIds: evidenceCheckerProfile.skillPackIds,
        remainingBudget,
        inputPayload: {
          fileId: input.fileId
        },
        run: async () => {
          const documentEvidence = getDocumentEvidence(db, { fileId: input.fileId })
          if (!documentEvidence) {
            throw new Error(`Document evidence not found for ${input.fileId}`)
          }

          const rawExcerpt = documentEvidence.rawText.trim().replace(/\s+/g, ' ').slice(0, 140)

          return {
            result: documentEvidence,
            outputPayload: {
              fileId: documentEvidence.fileId,
              fileName: documentEvidence.fileName,
              approvedFieldCount: documentEvidence.approvedFields.length,
              fieldCandidateCount: documentEvidence.fieldCandidates.length,
              layoutBlockCount: documentEvidence.layoutBlocks.length,
              rawExcerpt
            },
            artifactRefs: [
              {
                kind: 'file',
                id: documentEvidence.fileId,
                label: documentEvidence.fileName
              }
            ]
          }
        }
      })

      const rawExcerpt = evidence.rawText.trim().replace(/\s+/g, ' ').slice(0, 140) || 'No OCR text available.'
      const artifactRefs = [
        {
          kind: 'file' as const,
          id: evidence.fileId,
          label: evidence.fileName
        }
      ]

      appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'tool_result',
        body: `Loaded document evidence for ${evidence.fileName}: ${evidence.approvedFields.length} approved fields, ${evidence.fieldCandidates.length} field candidates, ${evidence.layoutBlocks.length} layout blocks.`,
        refs: artifactRefs
      })

      let externalVerificationSummary: string | null = null

      if (input.crossCheckClaim && input.crossCheckQuery) {
        const nestedDelegation = await delegateSubagentFromRunner({
          proposal: input.proposal,
          parentSubthreadId: subthread.threadId,
          requestedByParticipantId: createdSubagent.subagentId,
          specialization: 'web-verifier',
          payload: {
            claim: input.crossCheckClaim,
            query: input.crossCheckQuery
          },
          approvalComment: 'Owner auto-approved nested external verification within the committed evidence scope.'
        })
        externalVerificationSummary = nestedDelegation.summary
      }

      const summary = externalVerificationSummary
        ? `Evidence checker reviewed ${evidence.fileName} with ${evidence.approvedFields.length} approved fields and ${evidence.fieldCandidates.length} field candidates. OCR excerpt: ${rawExcerpt}. External verification: ${externalVerificationSummary}`
        : `Evidence checker reviewed ${evidence.fileName} with ${evidence.approvedFields.length} approved fields and ${evidence.fieldCandidates.length} field candidates. OCR excerpt: ${rawExcerpt}`

      appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'final_response',
        body: summary,
        refs: artifactRefs
      })

      appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: input.proposal.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'evidence_response',
        body: summary,
        refs: artifactRefs
      })

      const completedSubagent = updateSubagent(db, {
        subagentId: createdSubagent.subagentId,
        status: 'completed',
        summary
      })
      const completedSubthread = updateThreadStatus(db, {
        threadId: subthread.threadId,
        status: 'completed'
      })

      createCheckpoint(db, {
        objectiveId: input.proposal.objectiveId,
        threadId: input.proposal.threadId,
        checkpointKind: 'tool_action_executed',
        title: 'Local evidence check completed',
        summary: `Evidence checker summarized local OCR evidence for ${evidence.fileName}.`,
        relatedProposalId: input.proposal.proposalId,
        artifactRefs
      })

      return {
        subagent: completedSubagent ?? createdSubagent,
        subthread: completedSubthread ?? subthread,
        evidence
      }
    } catch (error) {
      updateSubagent(db, {
        subagentId: createdSubagent.subagentId,
        status: 'failed',
        summary: `Evidence checker failed: ${asErrorMessage(error)}`
      })
      updateThreadStatus(db, {
        threadId: subthread.threadId,
        status: 'blocked'
      })
      throw error
    }
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

    const committed = updateProposalFromGate({
      proposalId: proposal.proposalId,
      nextStatus: 'committed'
    })

    await executeCommittedSpawnSubagentProposal(committed)

    return committed
  }

  return {
    startObjective(input: {
      title: string
      objectiveKind: Parameters<FacilitatorService['acceptObjective']>[0]['objectiveKind']
      prompt: string
      initiatedBy?: Parameters<FacilitatorService['acceptObjective']>[0]['initiatedBy']
    }) {
      return dependencies.facilitator.acceptObjective({
        db,
        title: input.title,
        objectiveKind: input.objectiveKind,
        prompt: input.prompt,
        initiatedBy: input.initiatedBy
      })
    },

    createProposal(input: Omit<CreateProposalInput, 'status'> & {
      status?: CreateProposalInput['status']
    }) {
      return createProposalWithCheckpoint({
        ...input,
        requiredApprovals: input.requiredApprovals ?? [input.ownerRole],
        allowVetoBy: input.allowVetoBy ?? ['governance'],
        status: input.status ?? 'under_review'
      })
    },

    raiseBlockingChallenge(input: {
      objectiveId: string
      threadId: string
      proposalId: string
      fromParticipantId: string
      body: string
    }) {
      const challengeMessage = appendAgentMessageV2(db, {
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        fromParticipantId: input.fromParticipantId,
        kind: 'challenge',
        body: input.body,
        round: 1,
        blocking: true
      })
      const runtimeState = loadProposalRuntimeState(input.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: [...runtimeState.messages, challengeMessage]
      })
      const updated = updateProposalStatus(db, {
        proposalId: input.proposalId,
        status: gate.status
      })
      if (!updated) {
        throw new Error(`failed to update proposal: ${input.proposalId}`)
      }

      writeStatusCheckpoint(input.proposalId, gate.status, challengeMessage.messageId)

      return updated
    },

    vetoProposal(input: {
      objectiveId: string
      threadId: string
      proposalId: string
      rationale: string
    }) {
      recordProposalVote(db, {
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        proposalId: input.proposalId,
        voterRole: 'governance',
        vote: 'veto',
        comment: input.rationale
      })
      const runtimeState = loadProposalRuntimeState(input.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: runtimeState.messages
      })
      const nextStatus = runtimeState.proposal.allowVetoBy.includes('governance')
        ? 'vetoed'
        : gate.status
      const updated = updateProposalStatus(db, {
        proposalId: input.proposalId,
        status: nextStatus
      })
      if (!updated) {
        throw new Error(`failed to update proposal: ${input.proposalId}`)
      }

      writeStatusCheckpoint(input.proposalId, nextStatus)

      return updated
    },

    async requestExternalVerification(input: {
      objectiveId: string
      threadId: string
      proposedByParticipantId: string
      claim: string
      query: string
    }) {
      const verifierProfile = getSubagentProfile('web-verifier')
      const proposal = createProposalWithCheckpoint({
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
    },

    approveProposalAsOwner(input: {
      objectiveId: string
      threadId: string
      proposalId: string
    }) {
      const proposal = getProposal(db, { proposalId: input.proposalId })
      if (!proposal) {
        throw new Error(`proposal not found: ${input.proposalId}`)
      }

      recordProposalVote(db, {
        objectiveId: input.objectiveId,
        threadId: input.threadId,
        proposalId: input.proposalId,
        voterRole: proposal.ownerRole,
        vote: 'approve',
        comment: 'Owner approved the proposal.'
      })

      const runtimeState = loadProposalRuntimeState(input.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: runtimeState.messages
      })
      const updated = updateProposalStatus(db, {
        proposalId: input.proposalId,
        status: gate.status
      })
      if (!updated) {
        throw new Error(`failed to update proposal: ${input.proposalId}`)
      }

      writeStatusCheckpoint(input.proposalId, gate.status)

      return updated
    },

    listObjectives(input?: ListAgentObjectivesInput) {
      return listObjectives(db, input)
    },

    getThreadDetail(input: {
      threadId: string
    }): AgentThreadDetail | null {
      return getThreadDetail(db, input)
    },

    async respondToAgentProposal(input: RespondToAgentProposalInput) {
      const proposal = getProposal(db, { proposalId: input.proposalId })
      if (!proposal) {
        return null
      }

      if (input.response === 'challenge') {
        return this.raiseBlockingChallenge({
          objectiveId: proposal.objectiveId,
          threadId: proposal.threadId,
          proposalId: proposal.proposalId,
          fromParticipantId: input.responderRole,
          body: input.comment ?? `${input.responderRole} raised a blocking challenge.`
        })
      }

      recordProposalVote(db, {
        objectiveId: proposal.objectiveId,
        threadId: proposal.threadId,
        proposalId: proposal.proposalId,
        voterRole: input.responderRole,
        vote: input.response,
        comment: input.comment,
        artifactRefs: input.artifactRefs
      })

      const runtimeState = loadProposalRuntimeState(proposal.proposalId)
      const gate = evaluateProposalGate({
        proposal: runtimeState.proposal,
        votes: runtimeState.votes,
        messages: runtimeState.messages
      })
      const nextStatus = input.response === 'reject'
        ? 'blocked'
        : gate.status

      const updated = updateProposalFromGate({
        proposalId: proposal.proposalId,
        nextStatus
      })

      return autoCommitEligibleSpawnSubagentProposal(updated)
    },

    async confirmAgentProposal(input: ConfirmAgentProposalInput) {
      const proposal = getProposal(db, { proposalId: input.proposalId })
      if (!proposal) {
        return null
      }

      const runtimeState = loadProposalRuntimeState(proposal.proposalId)
      const decisionMessage = input.operatorNote
        ? appendAgentMessageV2(db, {
          objectiveId: proposal.objectiveId,
          threadId: proposal.threadId,
          fromParticipantId: 'operator',
          kind: 'decision',
          body: input.operatorNote,
          round: (runtimeState.messages.at(-1)?.round ?? 0) + 1,
          blocking: input.decision === 'block'
        })
        : null
      const nextStatus = input.decision === 'block'
        ? 'blocked'
        : evaluateProposalGate({
          proposal: runtimeState.proposal,
          votes: runtimeState.votes,
          messages: runtimeState.messages,
          operatorConfirmed: true
        }).status

      const updated = updateProposalFromGate({
        proposalId: proposal.proposalId,
        nextStatus,
        messageId: decisionMessage?.messageId
      })

      if (updated.status === 'committed') {
        await executeCommittedSpawnSubagentProposal(updated)
      }

      return updated
    },

    getObjectiveDetail(input: {
      objectiveId: string
    }): AgentObjectiveDetail | null {
      return getObjectiveDetail(db, input)
    }
  }
}
