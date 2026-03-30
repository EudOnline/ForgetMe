import type {
  AgentProposalRecord,
  AgentSkillPackId
} from '../../shared/archiveContracts'

export type SpawnSubagentRunnerContext<TPayload> = {
  proposal: AgentProposalRecord
  requestedByParticipantId: string
  payload: TPayload
}

export type SpawnSubagentRunnerDefinition<TPayload, TResult> = {
  parsePayload(payload: Record<string, unknown>): TPayload
  run(input: SpawnSubagentRunnerContext<TPayload>): Promise<TResult>
}

export function createSpawnSubagentRunnerRegistry(
  definitions: Partial<Record<AgentSkillPackId, SpawnSubagentRunnerDefinition<any, any>>>
) {
  return {
    async executeCommittedProposal(proposal: AgentProposalRecord) {
      if (proposal.proposalKind !== 'spawn_subagent') {
        return null
      }

      const specialization = typeof proposal.payload.specialization === 'string'
        ? proposal.payload.specialization
        : ''
      const definition = specialization
        ? definitions[specialization as AgentSkillPackId]
        : undefined

      if (!definition) {
        throw new Error(`Unsupported subagent specialization: ${specialization || 'unknown'}`)
      }

      const payload = definition.parsePayload(proposal.payload)

      return definition.run({
        proposal,
        requestedByParticipantId: proposal.proposedByParticipantId,
        payload
      })
    }
  }
}
