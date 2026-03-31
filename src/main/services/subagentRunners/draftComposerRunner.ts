import type {
  AgentArtifactRef,
  MemoryWorkspaceExpressionMode,
  MemoryWorkspaceScope,
  MemoryWorkspaceTurnRecord
} from '../../../shared/archiveContracts'

export type DraftComposerPayload = {
  question: string
  scope: MemoryWorkspaceScope
  expressionMode: MemoryWorkspaceExpressionMode
  sessionId: string | null
}

export type DraftWorkspaceTurn = MemoryWorkspaceTurnRecord

type AuthorizedToolRunner = <T>(input: {
  toolName: string
  inputPayload: Record<string, unknown>
  run: () => Promise<{
    result: T
    outputPayload: Record<string, unknown>
    artifactRefs?: AgentArtifactRef[]
  }>
}) => Promise<T>

type DraftComposerTaskInput = {
  payload: DraftComposerPayload
  askWorkspace: (payload: DraftComposerPayload) => Promise<DraftWorkspaceTurn | null>
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

export function parseDraftComposerPayload(payload: Record<string, unknown>): DraftComposerPayload {
  const question = typeof payload.question === 'string' ? payload.question.trim() : ''
  if (!question) {
    throw new Error('draft-composer payload requires a non-empty question')
  }

  return {
    question,
    scope: asScope(payload.scope),
    expressionMode: payload.expressionMode === 'advice' ? 'advice' : 'grounded',
    sessionId: typeof payload.sessionId === 'string' && payload.sessionId.trim()
      ? payload.sessionId.trim()
      : null
  }
}

export async function runDraftComposerTask(input: DraftComposerTaskInput) {
  const turn = await input.runTool({
    toolName: 'ask_memory_workspace',
    inputPayload: {
      question: input.payload.question,
      scope: input.payload.scope,
      expressionMode: input.payload.expressionMode,
      sessionId: input.payload.sessionId
    },
    run: async () => {
      const result = await input.askWorkspace(input.payload)
      if (!result) {
        throw new Error('Draft workspace turn could not be created')
      }

      return {
        result,
        outputPayload: {
          turnId: result.turnId,
          sessionId: result.sessionId,
          workflowKind: result.response.workflowKind ?? 'default'
        },
        artifactRefs: [
          {
            kind: 'workspace_turn',
            id: result.turnId,
            label: result.turnId
          }
        ]
      }
    }
  })

  const draft = await input.runTool({
    toolName: 'compose_reviewed_draft',
    inputPayload: {
      turnId: turn.turnId,
      sessionId: turn.sessionId
    },
    run: async () => {
      const body = turn.response.personaDraft?.draft?.trim()
        || turn.response.answer?.summary?.trim()
        || ''
      if (!body) {
        throw new Error('Draft workspace turn did not produce draft content')
      }

      return {
        result: body,
        outputPayload: {
          turnId: turn.turnId,
          sessionId: turn.sessionId,
          workflowKind: turn.response.workflowKind ?? 'default',
          reviewState: turn.response.personaDraft?.reviewState ?? null
        },
        artifactRefs: [
          {
            kind: 'workspace_turn',
            id: turn.turnId,
            label: turn.turnId
          }
        ]
      }
    }
  })

  return {
    summary: draft,
    artifactRefs: [
      {
        kind: 'workspace_turn' as const,
        id: turn.turnId,
        label: turn.turnId
      }
    ]
  }
}
