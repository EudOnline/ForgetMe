import type { AgentAdapter } from './agentTypes'

function extractOptionalFileId(prompt: string) {
  const match = prompt.match(/\b(file-[A-Za-z0-9-]+)\b/i)
  return match?.[1] ?? match?.[0] ?? null
}

export function createIngestionAgentService(
  _dependencies: Record<string, never> = {}
): AgentAdapter {
  return {
    role: 'ingestion',
    async receive(context) {
      if (context.objective.objectiveKind === 'evidence_investigation') {
        const fileId = extractOptionalFileId(context.objective.prompt)
        if (!fileId) {
          return {
            messages: []
          }
        }

        return {
          messages: [],
          spawnRequests: [
            {
              specialization: 'evidence-checker',
              ownerRole: 'workspace',
              payload: {
                fileId
              },
              requiredApprovals: ['workspace'],
              allowVetoBy: ['governance'],
              requiresOperatorConfirmation: false
            }
          ]
        }
      }

      return {
        messages: []
      }
    }
  }
}
