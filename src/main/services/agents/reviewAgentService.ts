import type { AgentAdapter } from './agentTypes'

export function createReviewAgentService(
  _dependencies: Record<string, never> = {}
): AgentAdapter {
  return {
    role: 'review',
    async receive(context) {
      const hasOpenProposal = context.proposals.some((proposal) => (
        proposal.status !== 'committed' && proposal.status !== 'superseded'
      ))

      if (context.objective.objectiveKind === 'review_decision' && hasOpenProposal) {
        return {
          messages: [
            {
              kind: 'challenge',
              body: 'Review requires tighter evidence bounds before approval.',
              blocking: true
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
