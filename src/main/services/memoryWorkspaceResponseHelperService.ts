import type {
  DossierDisplayType,
  MemoryWorkspaceAnswer,
  MemoryWorkspaceBoundaryRedirect,
  MemoryWorkspaceCommunicationEvidence,
  MemoryWorkspaceCommunicationExcerpt,
  MemoryWorkspaceCitation,
  MemoryWorkspaceContextCard,
  MemoryWorkspaceExpressionMode,
  MemoryWorkspaceGuardrail,
  MemoryWorkspaceGuardrailDecision,
  MemoryWorkspaceGuardrailReasonCode,
  MemoryWorkspacePersonaDraft,
  MemoryWorkspaceResponse,
  MemoryWorkspaceSuggestedAction,
  MemoryWorkspaceWorkflowKind,
  PersonDossierEvidenceRef
} from '../../shared/archiveContracts'

const CONFLICT_KEYWORDS = ['冲突', 'conflict', '不确定', 'ambigu', 'gap', '矛盾']
const RECENT_KEYWORDS = ['最近', 'timeline', '时间', '发生', 'recent', 'latest']
const PRIORITY_KEYWORDS = ['优先', '关注', 'pending', 'review', 'pressure', '值得']
const PERSONA_REQUEST_KEYWORDS = ['像她本人', '像他本人', '像本人', '模仿', '口吻', '语气', '会怎么说', '会怎么建议', 'voice', 'style']
const FOLLOW_UP_PREFIXES = ['那', '为什么', '那为什么', '继续', '展开', '具体一点', '再说', 'why', 'continue', 'this', 'that']
const FOLLOW_UP_KEYWORDS = ['继续', '展开说', '具体一点', '那为什么', 'why', 'continue']

export type MemoryWorkspacePriorTurnContext = {
  turnId: string
  question: string
  answerSummary: string
  workflowKind: MemoryWorkspaceResponse['workflowKind']
  expressionMode: MemoryWorkspaceResponse['expressionMode']
  createdAt: string
}

function normalizeQuestion(question: string) {
  return question.trim().toLowerCase()
}

function hasKeyword(question: string, keywords: string[]) {
  const normalizedQuestion = normalizeQuestion(question)
  return keywords.some((keyword) => normalizedQuestion.includes(keyword))
}

export function isFollowUpQuestion(question: string) {
  const normalizedQuestion = normalizeQuestion(question)
  return FOLLOW_UP_PREFIXES.some((prefix) => normalizedQuestion.startsWith(prefix))
    || FOLLOW_UP_KEYWORDS.some((keyword) => normalizedQuestion.includes(keyword))
}

export function isPersonaRequestQuestion(question: string) {
  return hasKeyword(question, PERSONA_REQUEST_KEYWORDS)
}

export function createCitation(
  cardId: string,
  index: number,
  kind: MemoryWorkspaceCitation['kind'],
  targetId: string,
  label: string
): MemoryWorkspaceCitation {
  return {
    citationId: `${cardId}:${kind}:${targetId}:${index}`,
    kind,
    targetId,
    label
  }
}

function dedupeCitations(citations: MemoryWorkspaceCitation[]) {
  const seen = new Set<string>()
  return citations.filter((citation) => {
    const key = `${citation.kind}:${citation.targetId}:${citation.label}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

export function createCard(input: {
  cardId: string
  title: string
  body: string
  displayType: DossierDisplayType
  citations?: MemoryWorkspaceCitation[]
}): MemoryWorkspaceContextCard {
  return {
    cardId: input.cardId,
    title: input.title,
    body: input.body,
    displayType: input.displayType,
    citations: dedupeCitations(input.citations ?? [])
  }
}

export function createAnswerFromCard(card: MemoryWorkspaceContextCard): MemoryWorkspaceAnswer {
  return {
    summary: card.body,
    displayType: card.displayType,
    citations: card.citations
  }
}

export function createCoverageAnswer(question: string): MemoryWorkspaceAnswer {
  return {
    summary: `Current evidence is insufficient to answer “${question}” confidently from the approved archive reads.`,
    displayType: 'coverage_gap',
    citations: []
  }
}

export function createPersonaFallbackAnswer(
  cards: MemoryWorkspaceContextCard[],
  question: string
): MemoryWorkspaceAnswer {
  const fallbackCard = cards.find((card) => card.title === 'Summary' || card.title === 'People Overview') ?? cards[0] ?? null
  const groundedSummary = fallbackCard ? ` Grounded archive summary: ${fallbackCard.body}` : ''

  return {
    summary: `This memory workspace cannot answer as if it were the archived person or imitate their voice/advice for “${question}”. It can only summarize grounded archive material.${groundedSummary}`,
    displayType: 'coverage_gap',
    citations: fallbackCard?.citations ?? []
  }
}

export function createAdviceAnswer(input: {
  selectedCard: MemoryWorkspaceContextCard | null
  question: string
}): MemoryWorkspaceAnswer {
  if (!input.selectedCard) {
    return createCoverageAnswer(input.question)
  }

  const baseAnswer = createAnswerFromCard(input.selectedCard)

  if (input.selectedCard.displayType === 'open_conflict') {
    return {
      ...baseAnswer,
      summary: `Based on the archive, the safest next step is to resolve the highest-pressure ambiguity first because the archive shows unresolved conflicts. ${input.selectedCard.body}`
    }
  }

  if (input.selectedCard.displayType === 'coverage_gap') {
    return {
      ...baseAnswer,
      summary: `Based on the archive, evidence is still insufficient to give reliable next-step advice for “${input.question}”. ${input.selectedCard.body}`
    }
  }

  return {
    ...baseAnswer,
    summary: `Based on the archive, the safest next step is to focus on this grounded signal first: ${input.selectedCard.body}`
  }
}

export function toMemoryCitationFromEvidenceRef(
  cardId: string,
  index: number,
  ref: PersonDossierEvidenceRef
): MemoryWorkspaceCitation | null {
  if (ref.kind === 'file') {
    return createCitation(cardId, index, 'file', ref.id, ref.label)
  }

  if (ref.kind === 'journal') {
    return createCitation(cardId, index, 'journal', ref.id, ref.label)
  }

  return null
}

export function pickAnswerCard(question: string, cards: MemoryWorkspaceContextCard[]) {
  const conversationCard = cards.find((card) => card.title === 'Conversation Context')
  const conflictsCard = cards.find((card) => card.title === 'Conflicts & Gaps' || card.title === 'Review Pressure' || card.title === 'Ambiguity')
  const timelineCard = cards.find((card) => card.title === 'Timeline Windows')
  const summaryCard = cards.find((card) => card.title === 'Summary' || card.title === 'People Overview')

  if (isFollowUpQuestion(question) && conversationCard) {
    return conversationCard
  }

  if (hasKeyword(question, PRIORITY_KEYWORDS) && conflictsCard) {
    return conflictsCard
  }

  if (hasKeyword(question, CONFLICT_KEYWORDS) && conflictsCard) {
    return conflictsCard
  }

  if (hasKeyword(question, RECENT_KEYWORDS) && timelineCard) {
    return timelineCard
  }

  return summaryCard ?? conflictsCard ?? timelineCard ?? cards[0] ?? null
}

export function buildConversationContextCard(
  question: string,
  priorTurns: MemoryWorkspacePriorTurnContext[]
) {
  if (!isFollowUpQuestion(question) || priorTurns.length === 0) {
    return null
  }

  const recentTurns = priorTurns.slice(-3).reverse()
  return createCard({
    cardId: 'conversation-context',
    title: 'Conversation Context',
    body: recentTurns
      .map((turn) => `Previous question: ${turn.question} Previous answer: ${turn.answerSummary}`)
      .join(' '),
    displayType: 'derived_summary'
  })
}

function collectResponseCitations(
  answer: MemoryWorkspaceAnswer,
  contextCards: MemoryWorkspaceContextCard[]
) {
  return dedupeCitations([
    ...answer.citations,
    ...contextCards.flatMap((card) => card.citations)
  ])
}

function uniqueSourceKinds(citations: MemoryWorkspaceCitation[]) {
  const seen = new Set<MemoryWorkspaceCitation['kind']>()
  const kinds: MemoryWorkspaceCitation['kind'][] = []

  for (const citation of citations) {
    if (!seen.has(citation.kind)) {
      seen.add(citation.kind)
      kinds.push(citation.kind)
    }
  }

  return kinds
}

function dedupeReasonCodes(reasonCodes: MemoryWorkspaceGuardrailReasonCode[]) {
  return [...new Set(reasonCodes)]
}

function buildSummaryRedirectQuestion(scope: MemoryWorkspaceResponse['scope']) {
  if (scope.kind === 'global') {
    return '先基于档案总结当前全局最明确的状态。'
  }

  if (scope.kind === 'group') {
    return '先基于档案总结这个群体当前最明确的状态。'
  }

  return '先基于档案总结她当前最明确的状态。'
}

function buildConflictRedirectQuestion(scope: MemoryWorkspaceResponse['scope']) {
  if (scope.kind === 'global') {
    return '当前最值得优先关注的未解决冲突或审阅压力是什么？'
  }

  if (scope.kind === 'group') {
    return '这个群体当前有哪些未解决冲突或歧义？'
  }

  return '她现在有哪些未解决冲突或证据缺口？'
}

function buildTimelineRedirectQuestion(scope: MemoryWorkspaceResponse['scope']) {
  if (scope.kind === 'global') {
    return '当前档案里最近最相关的时间线窗口是什么？'
  }

  if (scope.kind === 'group') {
    return '这个群体最近最相关的时间线窗口是什么？'
  }

  return '她最近最相关的时间线窗口是什么？'
}

function buildAdviceRedirectQuestion(scope: MemoryWorkspaceResponse['scope']) {
  if (scope.kind === 'group') {
    return '基于档案，现在这个群体最安全的下一步是什么？'
  }

  return '基于档案，现在最安全的下一步是什么？'
}

function buildPastExpressionsRedirectQuestion(scope: MemoryWorkspaceResponse['scope']) {
  if (scope.kind === 'global') {
    return '档案里过去是怎么表达这类事的？给我看相关原话。'
  }

  if (scope.kind === 'group') {
    return '这个群体过去是怎么表达这类事的？给我看相关原话。'
  }

  return '她过去是怎么表达这类事的？给我看相关原话。'
}

export function buildPersonaDraftSandboxQuestion(scope: MemoryWorkspaceResponse['scope']) {
  if (scope.kind === 'global') {
    return '如果基于这些档案表达先生成一个可审阅草稿，会怎么写？'
  }

  if (scope.kind === 'group') {
    return '如果基于这个群体过去的表达先生成一个可审阅草稿，会怎么写？'
  }

  return '如果她来写这段话，会怎么写？先给我一个可审阅草稿。'
}

function createAskAction(input: {
  label: string
  question: string
  expressionMode: MemoryWorkspaceExpressionMode
  rationale: string
}): MemoryWorkspaceSuggestedAction {
  return {
    kind: 'ask',
    ...input
  }
}

function buildPersonaRedirectSuggestedActions(input: {
  scope: MemoryWorkspaceResponse['scope']
  contextCards: MemoryWorkspaceContextCard[]
  hasCommunicationEvidence: boolean
}): MemoryWorkspaceSuggestedAction[] {
  const suggestions: MemoryWorkspaceSuggestedAction[] = []
  const hasCard = (titles: string[]) => input.contextCards.some((card) => titles.includes(card.title))

  if (hasCard(['Summary', 'People Overview'])) {
    suggestions.push(createAskAction({
      label: 'Grounded summary',
      question: buildSummaryRedirectQuestion(input.scope),
      expressionMode: 'grounded',
      rationale: 'Summarize the strongest approved archive signal first.'
    }))
  }

  if (input.hasCommunicationEvidence) {
    suggestions.push(createAskAction({
      label: 'Past expressions',
      question: buildPastExpressionsRedirectQuestion(input.scope),
      expressionMode: 'grounded',
      rationale: 'Review direct archive-backed excerpts instead of imitating voice.'
    }))
    suggestions.push({
      kind: 'open_persona_draft_sandbox',
      workflowKind: 'persona_draft_sandbox',
      label: 'Reviewed draft sandbox',
      question: buildPersonaDraftSandboxQuestion(input.scope),
      expressionMode: 'grounded',
      rationale: 'Generate a clearly labeled simulation draft backed by archive quotes.'
    })
  }

  suggestions.push(createAskAction({
    label: 'Advice next step',
    question: buildAdviceRedirectQuestion(input.scope),
    expressionMode: 'advice',
    rationale: 'Convert the current archive state into a safe next-step ask.'
  }))

  if (hasCard(['Conflicts & Gaps', 'Review Pressure', 'Ambiguity'])) {
    suggestions.push(createAskAction({
      label: 'Open conflicts',
      question: buildConflictRedirectQuestion(input.scope),
      expressionMode: 'grounded',
      rationale: 'Review unresolved archive tensions before interpreting intent.'
    }))
  }

  if (hasCard(['Timeline Windows'])) {
    suggestions.push(createAskAction({
      label: 'Recent timeline',
      question: buildTimelineRedirectQuestion(input.scope),
      expressionMode: 'grounded',
      rationale: 'Inspect the latest grounded timeline window instead of imitating voice.'
    }))
  }

  if (suggestions.length >= 2) {
    return suggestions.slice(0, 5)
  }

  return [
    createAskAction({
      label: 'Grounded summary',
      question: buildSummaryRedirectQuestion(input.scope),
      expressionMode: 'grounded',
      rationale: 'Summarize the strongest approved archive signal first.'
    }),
    createAskAction({
      label: 'Advice next step',
      question: buildAdviceRedirectQuestion(input.scope),
      expressionMode: 'advice',
      rationale: 'Convert the current archive state into a safe next-step ask.'
    })
  ]
}

export function createPersonaBoundaryRedirect(input: {
  scope: MemoryWorkspaceResponse['scope']
  contextCards: MemoryWorkspaceContextCard[]
  hasCommunicationEvidence: boolean
}): MemoryWorkspaceBoundaryRedirect {
  return {
    kind: 'persona_request',
    title: 'Persona request blocked',
    message: 'This memory workspace cannot answer as if it were the archived person. Use grounded archive questions instead of imitation.',
    reasons: ['persona_request', 'delegation_not_allowed', 'style_evidence_unavailable'],
    suggestedActions: buildPersonaRedirectSuggestedActions(input)
  }
}

export function isDefaultPersonaDraftSandboxQuestion(
  scope: MemoryWorkspaceResponse['scope'],
  question: string
) {
  return normalizeQuestion(question) === normalizeQuestion(buildPersonaDraftSandboxQuestion(scope))
}

export function createCommunicationEvidencePayload(
  excerpts: MemoryWorkspaceCommunicationExcerpt[]
): MemoryWorkspaceCommunicationEvidence {
  return {
    title: 'Communication Evidence',
    summary: 'Direct archive-backed excerpts related to this ask.',
    excerpts
  }
}

export function createCommunicationEvidenceAnswer(input: {
  question: string
  communicationEvidence: MemoryWorkspaceCommunicationEvidence
}): MemoryWorkspaceAnswer {
  return {
    summary: `Direct chat excerpts in the approved archive address “${input.question}”. Review the supporting excerpts below.`,
    displayType: 'derived_summary',
    citations: dedupeCitations(
      input.communicationEvidence.excerpts.map((excerpt, index) =>
        createCitation(
          'communication-evidence',
          index,
          'file',
          excerpt.fileId,
          excerpt.fileName
        )
      )
    )
  }
}

export function createCommunicationCoverageAnswer(question: string): MemoryWorkspaceAnswer {
  return {
    summary: `Current approved chat evidence is insufficient to answer “${question}” with direct archive-backed excerpts.`,
    displayType: 'coverage_gap',
    citations: []
  }
}

export function createPersonaDraftSandboxAnswer(input: {
  question: string
  communicationEvidence: MemoryWorkspaceCommunicationEvidence
}): MemoryWorkspaceAnswer {
  return {
    summary: `Reviewed simulation draft generated from archive-backed excerpts for “${input.question}”. Review the disclaimer and quote trace below.`,
    displayType: 'derived_summary',
    citations: dedupeCitations(
      input.communicationEvidence.excerpts.map((excerpt, index) =>
        createCitation(
          'persona-draft-sandbox',
          index,
          'file',
          excerpt.fileId,
          excerpt.fileName
        )
      )
    )
  }
}

export function createPersonaDraftCoverageAnswer(question: string): MemoryWorkspaceAnswer {
  return {
    summary: `Current approved chat evidence is insufficient to build a reviewed draft sandbox for “${question}”.`,
    displayType: 'coverage_gap',
    citations: []
  }
}

export function buildGuardrail(input: {
  question: string
  answer: MemoryWorkspaceAnswer
  contextCards: MemoryWorkspaceContextCard[]
  workflowKind: MemoryWorkspaceWorkflowKind
  personaDraft: MemoryWorkspacePersonaDraft | null
}): MemoryWorkspaceGuardrail {
  const citations = collectResponseCitations(input.answer, input.contextCards)
  const reasonCodes: MemoryWorkspaceGuardrailReasonCode[] = []
  const hasPersonaRequest = input.workflowKind === 'default' && isPersonaRequestQuestion(input.question)
  const hasConflict = input.answer.displayType === 'open_conflict'
    || input.contextCards.some((card) => card.displayType === 'open_conflict')
  const answerIsConflict = input.answer.displayType === 'open_conflict'
  const hasCoverageGap = input.answer.displayType === 'coverage_gap'
    || input.contextCards.some((card) => card.displayType === 'coverage_gap')
  const hasReviewPressure = input.contextCards.some((card) => card.title === 'Review Pressure' && card.displayType === 'open_conflict')

  if (input.workflowKind === 'persona_draft_sandbox' && input.personaDraft) {
    reasonCodes.push('persona_draft_sandbox', 'quote_trace_required')
    if (citations.length === 0) {
      reasonCodes.push('insufficient_citations')
    }
    if (citations.length > 1) {
      reasonCodes.push('multi_source_synthesis')
    }

    return {
      decision: 'sandbox_review_required',
      reasonCodes: dedupeReasonCodes(reasonCodes),
      citationCount: citations.length,
      sourceKinds: uniqueSourceKinds(citations),
      fallbackApplied: false
    }
  }

  if (hasPersonaRequest) {
    reasonCodes.push('persona_request')
  }
  if (hasConflict) {
    reasonCodes.push('open_conflict_present')
  }
  if (hasCoverageGap) {
    reasonCodes.push('coverage_gap_present')
  }
  if (citations.length === 0) {
    reasonCodes.push('insufficient_citations')
  }
  if (citations.length > 1) {
    reasonCodes.push('multi_source_synthesis')
  }
  if (hasReviewPressure) {
    reasonCodes.push('review_pressure_present')
  }

  let decision: MemoryWorkspaceGuardrailDecision = 'grounded_answer'
  if (hasPersonaRequest) {
    decision = 'fallback_unsupported_request'
  } else if (answerIsConflict) {
    decision = 'fallback_to_conflict'
  } else if (hasCoverageGap || citations.length === 0) {
    decision = 'fallback_insufficient_evidence'
  }

  return {
    decision,
    reasonCodes: dedupeReasonCodes(reasonCodes),
    citationCount: citations.length,
    sourceKinds: uniqueSourceKinds(citations),
    fallbackApplied: decision !== 'grounded_answer'
  }
}
