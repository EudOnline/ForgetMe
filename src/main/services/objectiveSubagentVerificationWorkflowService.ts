import type { createExternalVerificationBrokerService } from './externalVerificationBrokerService'
import { getDocumentEvidence } from './enrichmentReadService'
import type {
  AgentArtifactRef,
  AgentMessageKind,
  AgentProposalRecord,
  AgentSkillPackId
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import type { RunnerSubagentDelegationResult } from './objectiveSubagentDelegationService'

type ExternalVerificationBrokerService = ReturnType<typeof createExternalVerificationBrokerService>

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

type DelegateSubagent = (input: {
  proposal: AgentProposalRecord
  parentSubthreadId: string
  requestedByParticipantId: string
  specialization: AgentSkillPackId
  payload: Record<string, unknown>
  approvalComment: string
}) => Promise<RunnerSubagentDelegationResult>

export async function runWebVerifierWorkflow(input: {
  proposal: AgentProposalRecord
  subthreadThreadId: string
  subagentId: string
  claim: string
  query: string
  localEvidenceFileId?: string | null
  runTool: RunTool
  appendRuntimeMessage: AppendRuntimeMessage
  externalVerificationBroker: ExternalVerificationBrokerService
  delegateSubagentFromRunner: DelegateSubagent
}) {
  const searchResults = await input.runTool({
    toolName: 'search_web',
    inputPayload: {
      claim: input.claim,
      query: input.query,
      maxResults: 3
    },
    run: async () => {
      const results = await input.externalVerificationBroker.searchClaimSources({
        claim: input.claim,
        query: input.query,
        maxResults: 3
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

  input.appendRuntimeMessage({
    objectiveId: input.proposal.objectiveId,
    threadId: input.subthreadThreadId,
    fromParticipantId: input.subagentId,
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
    const source = await input.runTool({
      toolName: 'open_source_page',
      inputPayload: {
        url: candidate.url
      },
      run: async () => {
        const openedSource = await input.externalVerificationBroker.openClaimSource({
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

  input.appendRuntimeMessage({
    objectiveId: input.proposal.objectiveId,
    threadId: input.subthreadThreadId,
    fromParticipantId: input.subagentId,
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

  const citationBundle = await input.runTool({
    toolName: 'capture_citation_bundle',
    inputPayload: {
      claim: input.claim,
      sourceCount: sources.length
    },
    run: async () => {
      const bundle = await input.externalVerificationBroker.buildCitationBundle({
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

  const citationRefs = citationBundle.sources.map((source) => ({
    kind: 'external_citation_bundle' as const,
    id: source.url,
    label: source.title
  }))

  input.appendRuntimeMessage({
    objectiveId: input.proposal.objectiveId,
    threadId: input.subthreadThreadId,
    fromParticipantId: input.subagentId,
    kind: 'tool_result',
    body: `Captured a citation bundle with verdict ${citationBundle.verdict}.`,
    refs: citationRefs
  })

  let localEvidenceSummary: string | null = null

  if (input.localEvidenceFileId) {
    const nestedDelegation = await input.delegateSubagentFromRunner({
      proposal: input.proposal,
      parentSubthreadId: input.subthreadThreadId,
      requestedByParticipantId: input.subagentId,
      specialization: 'evidence-checker',
      payload: {
        fileId: input.localEvidenceFileId
      },
      approvalComment: 'Owner auto-approved nested local evidence delegation within the committed verifier scope.'
    })
    localEvidenceSummary = nestedDelegation.summary
  }

  return {
    summary: localEvidenceSummary
      ? `Web verifier finished with verdict ${citationBundle.verdict} from ${citationBundle.sources.length} source${citationBundle.sources.length === 1 ? '' : 's'}. Local evidence: ${localEvidenceSummary}`
      : `Web verifier finished with verdict ${citationBundle.verdict} from ${citationBundle.sources.length} source${citationBundle.sources.length === 1 ? '' : 's'}.`,
    refs: citationRefs,
    checkpointKind: 'external_verification_completed' as const,
    checkpointTitle: 'External verification completed',
    checkpointSummary: `Verification verdict: ${citationBundle.verdict}.`,
    citationBundle
  }
}

export async function runEvidenceCheckerWorkflow(input: {
  db: ArchiveDatabase
  proposal: AgentProposalRecord
  subthreadThreadId: string
  subagentId: string
  fileId: string
  crossCheckClaim?: string | null
  crossCheckQuery?: string | null
  runTool: RunTool
  appendRuntimeMessage: AppendRuntimeMessage
  delegateSubagentFromRunner: DelegateSubagent
}) {
  const evidence = await input.runTool({
    toolName: 'get_document_evidence',
    inputPayload: {
      fileId: input.fileId
    },
    run: async () => {
      const documentEvidence = getDocumentEvidence(input.db, { fileId: input.fileId })
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

  input.appendRuntimeMessage({
    objectiveId: input.proposal.objectiveId,
    threadId: input.subthreadThreadId,
    fromParticipantId: input.subagentId,
    kind: 'tool_result',
    body: `Loaded document evidence for ${evidence.fileName}: ${evidence.approvedFields.length} approved fields, ${evidence.fieldCandidates.length} field candidates, ${evidence.layoutBlocks.length} layout blocks.`,
    refs: artifactRefs
  })

  let externalVerificationSummary: string | null = null

  if (input.crossCheckClaim && input.crossCheckQuery) {
    const nestedDelegation = await input.delegateSubagentFromRunner({
      proposal: input.proposal,
      parentSubthreadId: input.subthreadThreadId,
      requestedByParticipantId: input.subagentId,
      specialization: 'web-verifier',
      payload: {
        claim: input.crossCheckClaim,
        query: input.crossCheckQuery
      },
      approvalComment: 'Owner auto-approved nested external verification within the committed evidence scope.'
    })
    externalVerificationSummary = nestedDelegation.summary
  }

  return {
    summary: externalVerificationSummary
      ? `Evidence checker reviewed ${evidence.fileName} with ${evidence.approvedFields.length} approved fields and ${evidence.fieldCandidates.length} field candidates. OCR excerpt: ${rawExcerpt}. External verification: ${externalVerificationSummary}`
      : `Evidence checker reviewed ${evidence.fileName} with ${evidence.approvedFields.length} approved fields and ${evidence.fieldCandidates.length} field candidates. OCR excerpt: ${rawExcerpt}`,
    refs: artifactRefs,
    checkpointKind: 'tool_action_executed' as const,
    checkpointTitle: 'Local evidence check completed',
    checkpointSummary: `Evidence checker summarized local OCR evidence for ${evidence.fileName}.`,
    evidence
  }
}
