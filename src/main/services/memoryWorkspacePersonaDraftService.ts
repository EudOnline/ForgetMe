import type {
  MemoryWorkspaceCommunicationExcerpt,
  MemoryWorkspacePersonaDraft
} from '../../shared/archiveContracts'

function normalizeExcerptText(text: string) {
  return text.trim().replace(/\s+/g, ' ')
}

function buildDeterministicDraft(excerpts: MemoryWorkspaceCommunicationExcerpt[]) {
  const corpus = excerpts.map((excerpt) => normalizeExcerptText(excerpt.text)).join(' ')

  if (corpus.includes('归档') || corpus.includes('记录')) {
    return '可审阅草稿：先把关键记录整理进归档，把重要细节继续记下来，这样后面查找会更稳妥。'
  }

  return '可审阅草稿：先把关键信息整理清楚，再把重要细节补齐，方便后续继续推进。'
}

export function createPersonaDraftFromCommunicationEvidence(input: {
  excerpts: MemoryWorkspaceCommunicationExcerpt[]
}): MemoryWorkspacePersonaDraft {
  return {
    title: 'Reviewed draft sandbox',
    disclaimer: 'Simulation draft based on archived expressions. Not a statement from the person.',
    draft: buildDeterministicDraft(input.excerpts),
    reviewState: 'review_required',
    supportingExcerpts: input.excerpts.map((excerpt) => excerpt.excerptId),
    trace: input.excerpts.map((excerpt, index) => ({
      traceId: `trace-${index + 1}`,
      excerptIds: [excerpt.excerptId],
      explanation: `Draft segment ${index + 1} stays grounded in ${excerpt.speakerDisplayName ?? 'the archive'} excerpt ${excerpt.excerptId}.`
    }))
  }
}
