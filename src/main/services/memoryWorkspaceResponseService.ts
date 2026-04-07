import type {
  MemoryWorkspaceAnswer,
  MemoryWorkspaceCommunicationEvidence,
  MemoryWorkspaceExpressionMode,
  MemoryWorkspacePersonaDraft,
  MemoryWorkspaceResponse,
  PersonAgentInteractionOutcomeKind,
  PersonAgentMemoryRef,
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  isCommunicationEvidenceQuestion,
  listGlobalCommunicationEvidence,
  listGroupCommunicationEvidence,
  listPersonCommunicationEvidence
} from './communicationEvidenceService'
import { createPersonaDraftFromCommunicationEvidence } from './memoryWorkspacePersonaDraftService'
import {
  buildConversationContextCard,
  buildGuardrail,
  createAdviceAnswer,
  createAnswerFromCard,
  createCommunicationCoverageAnswer,
  createCommunicationEvidenceAnswer,
  createCommunicationEvidencePayload,
  createCoverageAnswer,
  createPersonaBoundaryRedirect,
  createPersonaDraftCoverageAnswer,
  createPersonaDraftSandboxAnswer,
  createPersonaFallbackAnswer,
  isDefaultPersonaDraftSandboxQuestion,
  isPersonaRequestQuestion,
  pickAnswerCard
} from './memoryWorkspaceResponseHelperService'
import type { MemoryWorkspacePriorTurnContext } from './memoryWorkspaceResponseHelperService'
export {
  createCard,
  createCitation,
  toMemoryCitationFromEvidenceRef,
  type MemoryWorkspacePriorTurnContext
} from './memoryWorkspaceResponseHelperService'

function listCommunicationEvidenceForScope(
  db: ArchiveDatabase,
  scope: MemoryWorkspaceResponse['scope'],
  question?: string
) {
  if (scope.kind === 'global') {
    return listGlobalCommunicationEvidence(db, {
      question,
      limit: 3
    })
  }

  if (scope.kind === 'group') {
    return listGroupCommunicationEvidence(db, {
      anchorPersonId: scope.anchorPersonId,
      question,
      limit: 3
    })
  }

  return listPersonCommunicationEvidence(db, {
    canonicalPersonId: scope.canonicalPersonId,
    question,
    limit: 3
  })
}

function scopeHasCommunicationEvidence(
  db: ArchiveDatabase,
  scope: MemoryWorkspaceResponse['scope']
) {
  return listCommunicationEvidenceForScope(db, scope).length > 0
}

function dedupePersonAgentRefs(refs: PersonAgentMemoryRef[]) {
  const seen = new Set<string>()
  const deduped: PersonAgentMemoryRef[] = []

  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(ref)
  }

  return deduped.sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`))
}

export function listPersonAgentInteractionRefs(response: MemoryWorkspaceResponse) {
  const citationRefs = [
    ...response.answer.citations,
    ...response.contextCards.flatMap((card) => card.citations)
  ].flatMap((citation): PersonAgentMemoryRef[] => {
    if (citation.kind === 'group') {
      return []
    }

    return [{
      kind: citation.kind,
      id: citation.targetId,
      label: citation.label
    }]
  })

  const communicationRefs = response.communicationEvidence?.excerpts.map((excerpt) => ({
    kind: 'file' as const,
    id: excerpt.fileId,
    label: excerpt.fileName
  })) ?? []

  return dedupePersonAgentRefs([
    ...citationRefs,
    ...communicationRefs
  ])
}

export function listPersonAgentInteractionOutcomeKinds(response: MemoryWorkspaceResponse): PersonAgentInteractionOutcomeKind[] {
  const outcomes = new Set<PersonAgentInteractionOutcomeKind>()

  if (response.boundaryRedirect) {
    outcomes.add('review_redirect')
  }

  if (
    response.guardrail.decision === 'fallback_to_conflict'
    || response.guardrail.reasonCodes.includes('open_conflict_present')
  ) {
    outcomes.add('conflict_redirect')
  }

  if (
    response.guardrail.decision === 'fallback_insufficient_evidence'
    || response.guardrail.reasonCodes.includes('coverage_gap_present')
  ) {
    outcomes.add('coverage_gap')
  }

  if (outcomes.size === 0) {
    outcomes.add('answered')
  }

  return [...outcomes]
}

export function createResponse(input: {
  db: ArchiveDatabase
  scope: MemoryWorkspaceResponse['scope']
  question: string
  expressionMode?: MemoryWorkspaceExpressionMode
  workflowKind?: MemoryWorkspaceResponse['workflowKind']
  title: string
  contextCards: MemoryWorkspaceResponse['contextCards']
  communicationEvidenceScope?: MemoryWorkspaceResponse['scope']
  priorTurnContext?: MemoryWorkspacePriorTurnContext[]
}) {
  const expressionMode = input.expressionMode ?? 'grounded'
  const workflowKind = input.workflowKind ?? 'default'
  const communicationEvidenceScope = input.communicationEvidenceScope ?? input.scope
  const conversationContextCard = buildConversationContextCard(input.question, input.priorTurnContext ?? [])
  const contextCards = conversationContextCard
    ? [conversationContextCard, ...input.contextCards]
    : input.contextCards
  const selectedCard = pickAnswerCard(input.question, contextCards)
  const isSandboxWorkflow = workflowKind === 'persona_draft_sandbox'
  const isPersonaRequest = !isSandboxWorkflow && isPersonaRequestQuestion(input.question)
  const isQuoteRequest = !isSandboxWorkflow && !isPersonaRequest && isCommunicationEvidenceQuestion(input.question)
  const matchedCommunicationExcerpts = (isSandboxWorkflow || isQuoteRequest)
    ? listCommunicationEvidenceForScope(input.db, communicationEvidenceScope, input.question)
    : []
  const candidateCommunicationExcerpts = isSandboxWorkflow
    && matchedCommunicationExcerpts.length < 2
    && isDefaultPersonaDraftSandboxQuestion(communicationEvidenceScope, input.question)
      ? listCommunicationEvidenceForScope(input.db, communicationEvidenceScope)
      : matchedCommunicationExcerpts
  const communicationEvidence = isSandboxWorkflow
    ? (candidateCommunicationExcerpts.length >= 2 ? createCommunicationEvidencePayload(candidateCommunicationExcerpts) : null)
    : (candidateCommunicationExcerpts.length > 0 ? createCommunicationEvidencePayload(candidateCommunicationExcerpts) : null)
  const hasCommunicationEvidence = communicationEvidence !== null
    || (isPersonaRequest && scopeHasCommunicationEvidence(input.db, communicationEvidenceScope))
  let answer: MemoryWorkspaceAnswer
  let personaDraft: MemoryWorkspacePersonaDraft | null = null

  if (isSandboxWorkflow) {
    if (communicationEvidence) {
      personaDraft = createPersonaDraftFromCommunicationEvidence({
        excerpts: communicationEvidence.excerpts
      })
      answer = createPersonaDraftSandboxAnswer({
        question: input.question,
        communicationEvidence
      })
    } else {
      answer = createPersonaDraftCoverageAnswer(input.question)
    }
  } else if (isPersonaRequest) {
    answer = createPersonaFallbackAnswer(contextCards, input.question)
  } else if (communicationEvidence) {
    answer = createCommunicationEvidenceAnswer({
      question: input.question,
      communicationEvidence
    })
  } else if (isQuoteRequest) {
    answer = createCommunicationCoverageAnswer(input.question)
  } else if (expressionMode === 'advice') {
    answer = createAdviceAnswer({
      selectedCard,
      question: input.question
    })
  } else if (selectedCard) {
    answer = createAnswerFromCard(selectedCard)
  } else {
    answer = createCoverageAnswer(input.question)
  }

  return {
    scope: input.scope,
    question: input.question,
    expressionMode,
    workflowKind,
    title: input.title,
    answer,
    contextCards,
    guardrail: buildGuardrail({
      question: input.question,
      answer,
      contextCards,
      workflowKind,
      personaDraft
    }),
    boundaryRedirect: isPersonaRequest
      ? createPersonaBoundaryRedirect({
          scope: input.scope,
          contextCards,
          hasCommunicationEvidence
        })
      : null,
    communicationEvidence,
    personaDraft
  } satisfies MemoryWorkspaceResponse
}
