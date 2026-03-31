import type {
  AgentArtifactRef,
  MemoryWorkspaceCompareSessionDetail,
  MemoryWorkspaceExpressionMode,
  MemoryWorkspaceScope,
  MemoryWorkspaceWorkflowKind
} from '../../../shared/archiveContracts'

export type CompareAnalystPayload = {
  question: string
  scope: MemoryWorkspaceScope
  expressionMode: MemoryWorkspaceExpressionMode
  workflowKind: MemoryWorkspaceWorkflowKind
}

export type CompareSessionResult = MemoryWorkspaceCompareSessionDetail

type AuthorizedToolRunner = <T>(input: {
  toolName: string
  inputPayload: Record<string, unknown>
  run: () => Promise<{
    result: T
    outputPayload: Record<string, unknown>
    artifactRefs?: AgentArtifactRef[]
  }>
}) => Promise<T>

type CompareAnalystTaskInput = {
  payload: CompareAnalystPayload
  runCompare: (payload: CompareAnalystPayload) => Promise<CompareSessionResult | null>
  runTool: AuthorizedToolRunner
}

function asScope(value: unknown): MemoryWorkspaceScope {
  if (!value || typeof value !== 'object') {
    return { kind: 'global' }
  }

  const scope = value as Record<string, unknown>
  if (scope.kind === 'person' && typeof scope.canonicalPersonId === 'string' && scope.canonicalPersonId.trim()) {
    return {
      kind: 'person',
      canonicalPersonId: scope.canonicalPersonId.trim()
    }
  }

  if (scope.kind === 'group' && typeof scope.anchorPersonId === 'string' && scope.anchorPersonId.trim()) {
    return {
      kind: 'group',
      anchorPersonId: scope.anchorPersonId.trim()
    }
  }

  return { kind: 'global' }
}

export function parseCompareAnalystPayload(payload: Record<string, unknown>): CompareAnalystPayload {
  const question = typeof payload.question === 'string' ? payload.question.trim() : ''
  if (!question) {
    throw new Error('compare-analyst payload requires a non-empty question')
  }

  return {
    question,
    scope: asScope(payload.scope),
    expressionMode: payload.expressionMode === 'advice' ? 'advice' : 'grounded',
    workflowKind: payload.workflowKind === 'persona_draft_sandbox' ? 'persona_draft_sandbox' : 'default'
  }
}

export async function runCompareAnalystTask(input: CompareAnalystTaskInput) {
  const session = await input.runTool({
    toolName: 'run_compare',
    inputPayload: {
      question: input.payload.question,
      scope: input.payload.scope,
      expressionMode: input.payload.expressionMode,
      workflowKind: input.payload.workflowKind
    },
    run: async () => {
      const result = await input.runCompare(input.payload)
      if (!result) {
        throw new Error('Compare session could not be created')
      }

      return {
        result,
        outputPayload: {
          compareSessionId: result.compareSessionId,
          runCount: result.runCount
        },
        artifactRefs: [
          {
            kind: 'compare_session',
            id: result.compareSessionId,
            label: result.compareSessionId
          }
        ]
      }
    }
  })

  const summary = await input.runTool({
    toolName: 'summarize_compare_results',
    inputPayload: {
      compareSessionId: session.compareSessionId
    },
    run: async () => {
      const reason = session.recommendation?.rationale?.trim()
      const summaryText = reason
        ? `Compare session ${session.compareSessionId} finished ${session.runCount} run(s). Recommendation: ${reason}`
        : `Compare session ${session.compareSessionId} finished ${session.runCount} run(s). No explicit recommendation was recorded.`

      return {
        result: summaryText,
        outputPayload: {
          compareSessionId: session.compareSessionId,
          runCount: session.runCount,
          recommendedCompareRunId: session.recommendation?.recommendedCompareRunId ?? null
        },
        artifactRefs: [
          {
            kind: 'compare_session',
            id: session.compareSessionId,
            label: session.compareSessionId
          }
        ]
      }
    }
  })

  return {
    summary,
    artifactRefs: [
      {
        kind: 'compare_session' as const,
        id: session.compareSessionId,
        label: session.compareSessionId
      }
    ]
  }
}
