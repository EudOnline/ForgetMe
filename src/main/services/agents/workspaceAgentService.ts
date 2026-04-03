import type { AgentAdapter } from './agentTypes'

export function createWorkspaceAgentService(
  _dependencies: Record<string, never> = {}
): AgentAdapter {
  return {
    role: 'workspace',
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
    }
  }
}
