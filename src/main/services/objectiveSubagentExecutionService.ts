import { evaluateProposalGate } from './agentProposalGateService'
import type { createExternalVerificationBrokerService } from './externalVerificationBrokerService'
import { getDocumentEvidence } from './enrichmentReadService'
import { createObjectiveSubagentLifecycleService } from './objectiveSubagentLifecycleService'
import { createObjectiveSubagentToolExecutionService } from './objectiveSubagentToolExecutionService'
import { runMemoryWorkspaceCompare } from './memoryWorkspaceCompareService'
import { askMemoryWorkspacePersisted } from './memoryWorkspaceSessionService'
import { listAgentPolicyVersions } from './agentPersistenceService'
import type { createSubagentRegistryService } from './subagentRegistryService'
import {
  parseCompareAnalystPayload,
  runCompareAnalystTask
} from './subagentRunners/compareAnalystRunner'
import {
  parseDraftComposerPayload,
  runDraftComposerTask
} from './subagentRunners/draftComposerRunner'
import {
  parsePolicyAuditorPayload,
  runPolicyAuditorTask
} from './subagentRunners/policyAuditorRunner'
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
  getThreadDetail,
  recordProposalVote,
  type CreateProposalInput
} from './objectivePersistenceService'
import type { ArchiveDatabase } from './db'

type ExternalVerificationBrokerService = ReturnType<typeof createExternalVerificationBrokerService>
type SubagentRegistryService = ReturnType<typeof createSubagentRegistryService>
type RunMemoryWorkspaceCompareService = typeof runMemoryWorkspaceCompare
type AskMemoryWorkspacePersistedService = typeof askMemoryWorkspacePersisted
type ListAgentPolicyVersionsService = typeof listAgentPolicyVersions
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
    const proposal = dependencies.helpers.createProposalWithCheckpoint({
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

    const runtimeState = dependencies.helpers.loadProposalRuntimeState(proposal.proposalId)
    const gate = evaluateProposalGate({
      proposal: runtimeState.proposal,
      votes: runtimeState.votes,
      messages: runtimeState.messages
    })

    const updated = dependencies.helpers.updateProposalFromGate({
      proposalId: proposal.proposalId,
      nextStatus: gate.status
    })

    if (updated.status !== 'committable' && updated.status !== 'committed') {
      throw new Error(`Nested spawn_subagent proposal did not become executable: ${updated.status}`)
    }

    const committed = updated.status === 'committed'
      ? updated
      : dependencies.helpers.updateProposalFromGate({
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

    dependencies.helpers.appendRuntimeMessage({
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

    dependencies.helpers.appendRuntimeMessage({
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
    toolExecutionService.consumeExecutionRound(remainingBudget)
    const title = `Web verification · ${input.claim.slice(0, 60)}`
    const { subthread, createdSubagent } = lifecycleService.startRegisteredSubagentExecution({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'web-verifier',
      title,
      goalBody: `Verify the external claim "${input.claim}" using the bounded query "${input.query}".`,
      toolPolicyId,
      executionBudget,
      spawnSummary: `Spawned web-verifier in subthread ${title} for bounded external verification.`
    })

    try {
      const searchResults = await toolExecutionService.runAuthorizedTool({
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
              kind: 'external_citation_bundle' as const,
              id: candidate.url,
              label: candidate.title
            }))
          }
        }
      })

      dependencies.helpers.appendRuntimeMessage({
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
        const source = await toolExecutionService.runAuthorizedTool({
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
                  kind: 'external_citation_bundle' as const,
                  id: openedSource.url,
                  label: openedSource.title
                }
              ]
            }
          }
        })
        sources.push(source)
      }

      dependencies.helpers.appendRuntimeMessage({
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

      const citationBundle = await toolExecutionService.runAuthorizedTool({
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
              kind: 'external_citation_bundle' as const,
              id: source.url,
              label: source.title
            }))
          }
        }
      })

      dependencies.helpers.appendRuntimeMessage({
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

      return {
        ...lifecycleService.completeRegisteredSubagentExecution({
          proposal: input.proposal,
          subthread,
          createdSubagent,
          summary,
          refs: citationBundle.sources.map((source) => ({
            kind: 'external_citation_bundle' as const,
            id: source.url,
            label: source.title
          })),
          checkpointKind: 'external_verification_completed',
          checkpointTitle: 'External verification completed',
          checkpointSummary: `Verification verdict: ${citationBundle.verdict}.`
        }),
        citationBundle
      }
    } catch (error) {
      lifecycleService.failRegisteredSubagentExecution({
        subthreadId: subthread.threadId,
        subagentId: createdSubagent.subagentId,
        summary: `Web verifier failed: ${asErrorMessage(error)}`
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
    toolExecutionService.consumeExecutionRound(remainingBudget)
    const title = `Evidence check · ${input.fileId}`
    const { subthread, createdSubagent } = lifecycleService.startRegisteredSubagentExecution({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'evidence-checker',
      title,
      goalBody: `Review local document evidence for file "${input.fileId}" and summarize approved fields, pending candidates, and the most relevant OCR excerpt.`,
      toolPolicyId,
      executionBudget,
      spawnSummary: `Spawned evidence-checker in subthread ${title} for bounded local evidence checking.`
    })

    try {
      const evidence = await toolExecutionService.runAuthorizedTool({
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
                kind: 'file' as const,
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

      dependencies.helpers.appendRuntimeMessage({
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

      return {
        ...lifecycleService.completeRegisteredSubagentExecution({
          proposal: input.proposal,
          subthread,
          createdSubagent,
          summary,
          refs: artifactRefs,
          checkpointKind: 'tool_action_executed',
          checkpointTitle: 'Local evidence check completed',
          checkpointSummary: `Evidence checker summarized local OCR evidence for ${evidence.fileName}.`
        }),
        evidence
      }
    } catch (error) {
      lifecycleService.failRegisteredSubagentExecution({
        subthreadId: subthread.threadId,
        subagentId: createdSubagent.subagentId,
        summary: `Evidence checker failed: ${asErrorMessage(error)}`
      })
      throw error
    }
  }

  async function runCompareAnalystSubagent(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    question: string
    scope: { kind: 'global' } | { kind: 'person'; canonicalPersonId: string } | { kind: 'group'; anchorPersonId: string }
    expressionMode: 'grounded' | 'advice'
    workflowKind: 'default' | 'persona_draft_sandbox'
  }) {
    const compareProfile = getSubagentProfile('compare-analyst')
    const toolPolicyId = input.proposal.toolPolicyId ?? getRequiredToolPolicyId('compare-analyst')
    const executionBudget = input.proposal.budget ?? { ...compareProfile.defaultBudget }
    const remainingBudget = {
      ...executionBudget
    }
    toolExecutionService.consumeExecutionRound(remainingBudget)
    const { subthread, createdSubagent } = lifecycleService.startRegisteredSubagentExecution({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'compare-analyst',
      title: `Compare analysis · ${input.question.slice(0, 60)}`,
      goalBody: `Compare grounded answer candidates for "${input.question}" and summarize the most trustworthy bounded result.`,
      toolPolicyId,
      executionBudget,
      spawnSummary: `Spawned compare-analyst in subthread Compare analysis · ${input.question.slice(0, 60)} for bounded compare analysis.`
    })

    try {
      const outcome = await runCompareAnalystTask({
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
          }) as any
        ),
        runTool: async ({ toolName, inputPayload, run }) => toolExecutionService.runAuthorizedTool({
          objectiveId: input.proposal.objectiveId,
          threadId: subthread.threadId,
          proposalId: input.proposal.proposalId,
          requestedByParticipantId: createdSubagent.subagentId,
          role: input.proposal.ownerRole,
          toolName,
          toolPolicyId,
          skillPackIds: compareProfile.skillPackIds,
          remainingBudget,
          inputPayload,
          run
        })
      })

      dependencies.helpers.appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'tool_result',
        body: `Started compare analysis for "${input.question}" and prepared compare session artifacts.`,
        refs: outcome.artifactRefs
      })
      dependencies.helpers.appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'tool_result',
        body: outcome.summary,
        refs: outcome.artifactRefs
      })

      return {
        ...lifecycleService.completeRegisteredSubagentExecution({
          proposal: input.proposal,
          subthread,
          createdSubagent,
          summary: outcome.summary,
          refs: outcome.artifactRefs,
          checkpointKind: 'tool_action_executed',
          checkpointTitle: 'Compare analysis completed',
          checkpointSummary: `Compare analyst summarized compare results for "${input.question}".`
        }),
        compare: outcome
      }
    } catch (error) {
      lifecycleService.failRegisteredSubagentExecution({
        subthreadId: subthread.threadId,
        subagentId: createdSubagent.subagentId,
        summary: `Compare analyst failed: ${asErrorMessage(error)}`
      })
      throw error
    }
  }

  async function runDraftComposerSubagent(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    question: string
    scope: { kind: 'global' } | { kind: 'person'; canonicalPersonId: string } | { kind: 'group'; anchorPersonId: string }
    expressionMode: 'grounded' | 'advice'
    sessionId?: string | null
  }) {
    const draftProfile = getSubagentProfile('draft-composer')
    const toolPolicyId = input.proposal.toolPolicyId ?? getRequiredToolPolicyId('draft-composer')
    const executionBudget = input.proposal.budget ?? { ...draftProfile.defaultBudget }
    const remainingBudget = {
      ...executionBudget
    }
    toolExecutionService.consumeExecutionRound(remainingBudget)
    const { subthread, createdSubagent } = lifecycleService.startRegisteredSubagentExecution({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'draft-composer',
      title: `Draft composition · ${input.question.slice(0, 60)}`,
      goalBody: `Prepare a reviewed simulation draft for "${input.question}" using the bounded memory workspace sandbox.`,
      toolPolicyId,
      executionBudget,
      spawnSummary: `Spawned draft-composer in subthread Draft composition · ${input.question.slice(0, 60)} for bounded draft composition.`
    })

    try {
      const outcome = await runDraftComposerTask({
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
          }) as any
        ),
        runTool: async ({ toolName, inputPayload, run }) => toolExecutionService.runAuthorizedTool({
          objectiveId: input.proposal.objectiveId,
          threadId: subthread.threadId,
          proposalId: input.proposal.proposalId,
          requestedByParticipantId: createdSubagent.subagentId,
          role: input.proposal.ownerRole,
          toolName,
          toolPolicyId,
          skillPackIds: draftProfile.skillPackIds,
          remainingBudget,
          inputPayload,
          run
        })
      })

      dependencies.helpers.appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'tool_result',
        body: `Draft composer loaded a workspace turn for "${input.question}".`,
        refs: outcome.artifactRefs
      })
      dependencies.helpers.appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'tool_result',
        body: 'Draft composer prepared a review-ready simulation draft.'
      })

      return {
        ...lifecycleService.completeRegisteredSubagentExecution({
          proposal: input.proposal,
          subthread,
          createdSubagent,
          summary: outcome.summary,
          refs: outcome.artifactRefs,
          checkpointKind: 'user_facing_result_prepared',
          checkpointTitle: 'Draft composition completed',
          checkpointSummary: `Draft composer prepared a review-ready draft for "${input.question}".`
        }),
        draft: outcome
      }
    } catch (error) {
      lifecycleService.failRegisteredSubagentExecution({
        subthreadId: subthread.threadId,
        subagentId: createdSubagent.subagentId,
        summary: `Draft composer failed: ${asErrorMessage(error)}`
      })
      throw error
    }
  }

  async function runPolicyAuditorSubagent(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    policyKey: string
    role: AgentRole
  }) {
    const policyProfile = getSubagentProfile('policy-auditor')
    const toolPolicyId = input.proposal.toolPolicyId ?? getRequiredToolPolicyId('policy-auditor')
    const executionBudget = input.proposal.budget ?? { ...policyProfile.defaultBudget }
    const remainingBudget = {
      ...executionBudget
    }
    toolExecutionService.consumeExecutionRound(remainingBudget)
    const { subthread, createdSubagent } = lifecycleService.startRegisteredSubagentExecution({
      proposal: input.proposal,
      requestedByParticipantId: input.requestedByParticipantId,
      specialization: 'policy-auditor',
      title: `Policy audit · ${input.policyKey}`,
      goalBody: `Audit policy versions for "${input.policyKey}" and summarize the latest bounded changes before rollout.`,
      toolPolicyId,
      executionBudget,
      spawnSummary: `Spawned policy-auditor in subthread Policy audit · ${input.policyKey} for bounded policy auditing.`
    })

    try {
      const outcome = await runPolicyAuditorTask({
        payload: {
          policyKey: input.policyKey,
          role: input.role
        },
        listPolicyVersions: (payload) => (
          (dependencies.listAgentPolicyVersions ?? listAgentPolicyVersions)(db, {
            role: payload.role,
            policyKey: payload.policyKey
          }) as any
        ),
        runTool: async ({ toolName, inputPayload, run }) => toolExecutionService.runAuthorizedTool({
          objectiveId: input.proposal.objectiveId,
          threadId: subthread.threadId,
          proposalId: input.proposal.proposalId,
          requestedByParticipantId: createdSubagent.subagentId,
          role: input.proposal.ownerRole,
          toolName,
          toolPolicyId,
          skillPackIds: policyProfile.skillPackIds,
          remainingBudget,
          inputPayload,
          run
        })
      })

      dependencies.helpers.appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'tool_result',
        body: `Policy auditor loaded bounded policy versions for ${input.policyKey}.`,
        refs: outcome.artifactRefs
      })
      dependencies.helpers.appendRuntimeMessage({
        objectiveId: input.proposal.objectiveId,
        threadId: subthread.threadId,
        fromParticipantId: createdSubagent.subagentId,
        kind: 'tool_result',
        body: outcome.summary,
        refs: outcome.artifactRefs
      })

      return {
        ...lifecycleService.completeRegisteredSubagentExecution({
          proposal: input.proposal,
          subthread,
          createdSubagent,
          summary: outcome.summary,
          refs: outcome.artifactRefs,
          checkpointKind: 'tool_action_executed',
          checkpointTitle: 'Policy audit completed',
          checkpointSummary: `Policy auditor summarized policy changes for ${input.policyKey}.`
        }),
        policyAudit: outcome
      }
    } catch (error) {
      lifecycleService.failRegisteredSubagentExecution({
        subthreadId: subthread.threadId,
        subagentId: createdSubagent.subagentId,
        summary: `Policy auditor failed: ${asErrorMessage(error)}`
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
