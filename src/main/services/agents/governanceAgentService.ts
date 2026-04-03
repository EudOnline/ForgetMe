import type {
} from '../../../shared/archiveContracts'
import type { AgentAdapter } from './agentTypes'

export function createGovernanceAgentService(
  _dependencies: Record<string, never> = {}
): AgentAdapter {
  return {
    role: 'governance',
    async receive(context) {
      const latestMessage = context.messages.at(-1)
      if (latestMessage?.kind === 'challenge' || context.objective.objectiveKind === 'policy_change') {
        return {
          messages: [
            {
              kind: 'risk_notice',
              body: 'Governance requires policy review before this objective can commit.'
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
