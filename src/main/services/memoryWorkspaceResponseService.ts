import type {
  MemoryWorkspaceAnswer,
  MemoryWorkspaceCommunicationEvidence,
  MemoryWorkspaceExpressionMode,
  MemoryWorkspacePersonaDraft,
  MemoryWorkspaceResponse,
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

export function createResponse(input: {
  db: ArchiveDatabase
  scope: MemoryWorkspaceResponse['scope']
  question: string
  expressionMode?: MemoryWorkspaceExpressionMode
  workflowKind?: MemoryWorkspaceResponse['workflowKind']
  title: string
  contextCards: MemoryWorkspaceResponse['contextCards']
  priorTurnContext?: MemoryWorkspacePriorTurnContext[]
}) {
  const expressionMode = input.expressionMode ?? 'grounded'
  const workflowKind = input.workflowKind ?? 'default'
  const conversationContextCard = buildConversationContextCard(input.question, input.priorTurnContext ?? [])
  const contextCards = conversationContextCard
    ? [conversationContextCard, ...input.contextCards]
    : input.contextCards
  const selectedCard = pickAnswerCard(input.question, contextCards)
  const isSandboxWorkflow = workflowKind === 'persona_draft_sandbox'
  const isPersonaRequest = !isSandboxWorkflow && isPersonaRequestQuestion(input.question)
  const isQuoteRequest = !isSandboxWorkflow && !isPersonaRequest && isCommunicationEvidenceQuestion(input.question)
  const matchedCommunicationExcerpts = (isSandboxWorkflow || isQuoteRequest)
    ? listCommunicationEvidenceForScope(input.db, input.scope, input.question)
    : []
  const candidateCommunicationExcerpts = isSandboxWorkflow
    && matchedCommunicationExcerpts.length < 2
    && isDefaultPersonaDraftSandboxQuestion(input.scope, input.question)
      ? listCommunicationEvidenceForScope(input.db, input.scope)
      : matchedCommunicationExcerpts
  const communicationEvidence = isSandboxWorkflow
    ? (candidateCommunicationExcerpts.length >= 2 ? createCommunicationEvidencePayload(candidateCommunicationExcerpts) : null)
    : (candidateCommunicationExcerpts.length > 0 ? createCommunicationEvidencePayload(candidateCommunicationExcerpts) : null)
  const hasCommunicationEvidence = communicationEvidence !== null || (isPersonaRequest && scopeHasCommunicationEvidence(input.db, input.scope))
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
