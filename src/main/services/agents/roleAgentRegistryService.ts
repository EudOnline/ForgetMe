import type {
  AgentRole,
  AgentThreadParticipantRecord
} from '../../../shared/archiveContracts'
import { createGovernanceAgentService } from './governanceAgentService'
import type { AgentAdapter } from './agentTypes'
import { createIngestionAgentService } from './ingestionAgentService'
import { createReviewAgentService } from './reviewAgentService'
import { createWorkspaceAgentService } from './workspaceAgentService'

export type RoleAgentRegistryDependencies = {
  workspace?: AgentAdapter
  review?: AgentAdapter
  governance?: AgentAdapter
  ingestion?: AgentAdapter
}

export function createRoleAgentRegistryService(
  dependencies: RoleAgentRegistryDependencies = {}
) {
  const registry = new Map<AgentRole, AgentAdapter>([
    ['workspace', dependencies.workspace ?? createWorkspaceAgentService()],
    ['review', dependencies.review ?? createReviewAgentService()],
    ['governance', dependencies.governance ?? createGovernanceAgentService()],
    ['ingestion', dependencies.ingestion ?? createIngestionAgentService()]
  ])

  return {
    get(role: AgentRole) {
      return registry.get(role) ?? null
    },

    listThreadRoles(
      participants: Array<Pick<AgentThreadParticipantRecord, 'participantKind' | 'role' | 'leftAt'>>
    ) {
      const roles = new Set<AgentRole>()
      for (const participant of participants) {
        if (participant.participantKind !== 'role' || participant.leftAt !== null || !participant.role) {
          continue
        }

        roles.add(participant.role)
      }

      return [...roles]
    }
  }
}
