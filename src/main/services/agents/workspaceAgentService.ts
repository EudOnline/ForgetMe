import type {
  MemoryWorkspaceTurnRecord,
  PublishApprovedPersonaDraftResult
} from '../../../shared/archiveContracts'
import { publishApprovedPersonaDraftToDirectory } from '../approvedDraftPublicationService'
import { runMemoryWorkspaceCompare } from '../memoryWorkspaceCompareService'
import { askMemoryWorkspacePersisted } from '../memoryWorkspaceSessionService'
import type { AgentAdapter } from './agentTypes'

type WorkspaceAgentDependencies = {
  askMemoryWorkspacePersisted?: typeof askMemoryWorkspacePersisted
  runMemoryWorkspaceCompare?: typeof runMemoryWorkspaceCompare
  publishApprovedPersonaDraft?: typeof publishApprovedPersonaDraftToDirectory
  publicationRoot?: string
}

function extractDraftReviewId(prompt: string) {
  const match = prompt.match(/\b(review-[A-Za-z0-9-]+)\b/i)
  if (!match) {
    throw new Error('Missing draft review id in prompt')
  }

  return match[1] ?? match[0]
}

export function createWorkspaceAgentService(
  dependencies: WorkspaceAgentDependencies = {}
): AgentAdapter {
  const askPersisted = dependencies.askMemoryWorkspacePersisted ?? askMemoryWorkspacePersisted
  const runCompare = dependencies.runMemoryWorkspaceCompare ?? runMemoryWorkspaceCompare
  const publishDraft = dependencies.publishApprovedPersonaDraft ?? publishApprovedPersonaDraftToDirectory
  const publicationRoot = dependencies.publicationRoot ?? '/tmp/agent-draft-publications'

  return {
    role: 'workspace',
    canHandle(taskKind) {
      return [
        'workspace.ask_memory',
        'workspace.compare',
        'workspace.publish_draft'
      ].includes(taskKind)
    },
    async receive(context) {
      if (context.objective.objectiveKind === 'evidence_investigation') {
        return {
          messages: [],
          proposals: [
            {
              proposalKind: 'verify_external_claim',
              payload: {
                claim: context.objective.prompt,
                query: context.objective.prompt
              },
              ownerRole: 'workspace',
              requiredApprovals: ['workspace'],
              allowVetoBy: ['governance'],
              toolPolicyId: 'tool-policy-web-1',
              budget: {
                maxRounds: 2,
                maxToolCalls: 3,
                timeoutMs: 30_000
              }
            }
          ]
        }
      }

      if (context.objective.objectiveKind === 'user_response') {
        return {
          messages: [],
          proposals: [
            {
              proposalKind: 'respond_to_user',
              payload: {
                prompt: context.objective.prompt
              },
              ownerRole: 'workspace',
              requiredApprovals: ['workspace']
            }
          ]
        }
      }

      return {
        messages: []
      }
    },
    async execute(context) {
      switch (context.taskKind) {
        case 'workspace.ask_memory': {
          const turn = askPersisted(context.db, {
            scope: { kind: 'global' },
            question: context.input.prompt
          }) as MemoryWorkspaceTurnRecord | null

          if (!turn) {
            throw new Error('Workspace question could not be answered')
          }

          return {
            messages: [
              {
                sender: 'tool',
                content: `Loaded workspace turn ${turn.turnId}.`
              },
              {
                sender: 'agent',
                content: turn.response.answer.summary
              }
            ]
          }
        }
        case 'workspace.compare': {
          const session = await runCompare(context.db, {
            scope: { kind: 'global' },
            question: context.input.prompt
          })

          if (!session) {
            throw new Error('Workspace compare session could not be created')
          }

          return {
            messages: [
              {
                sender: 'tool',
                content: `Created compare session ${session.compareSessionId}.`
              },
              {
                sender: 'agent',
                content: `Workspace compare ready with ${session.runCount} runs in session ${session.compareSessionId}.`
              }
            ]
          }
        }
        case 'workspace.publish_draft': {
          const draftReviewId = extractDraftReviewId(context.input.prompt)
          const publication = publishDraft(context.db, {
            draftReviewId,
            destinationRoot: publicationRoot
          }) as PublishApprovedPersonaDraftResult | null

          if (!publication) {
            throw new Error(`Unable to publish approved draft ${draftReviewId}`)
          }

          return {
            messages: [
              {
                sender: 'tool',
                content: `Published draft ${draftReviewId} to ${publication.packageRoot}.`
              },
              {
                sender: 'agent',
                content: `Approved draft published as ${publication.publicationId}.`
              }
            ]
          }
        }
      }

      throw new Error(`Unsupported workspace task kind: ${context.taskKind}`)
    }
  }
}
