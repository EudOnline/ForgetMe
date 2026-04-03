import type {
  AgentMemoryRecord,
  AgentPolicyVersionRecord,
  AgentProposalRecord,
  AgentRole
} from '../../shared/archiveContracts'
import type {
  AgentObjectiveDetail,
  AgentObjectiveRecord,
  AgentThreadDetail,
  ConfirmAgentProposalInput,
  CreateAgentObjectiveInput,
  GetAgentObjectiveInput,
  GetAgentThreadInput,
  ListAgentObjectivesInput,
  RespondToAgentProposalInput
} from '../../shared/objectiveRuntimeContracts'
import type { ArchiveApi } from '../../shared/archiveContracts'
import { bridgeMethod } from './clientHelpers'

type ObjectiveClient = Pick<
  ArchiveApi,
  | 'createAgentObjective'
  | 'refreshObjectiveTriggers'
  | 'listAgentObjectives'
  | 'getAgentObjective'
  | 'getAgentThread'
  | 'respondToAgentProposal'
  | 'confirmAgentProposal'
  | 'listAgentMemories'
  | 'listAgentPolicyVersions'
>

function fallbackOwnerRoleForObjective(input: CreateAgentObjectiveInput): AgentRole {
  if (input.ownerRole) {
    return input.ownerRole
  }

  switch (input.objectiveKind) {
    case 'review_decision':
      return 'review'
    case 'policy_change':
      return 'governance'
    case 'user_response':
    case 'publication':
    case 'evidence_investigation':
    default:
      return 'workspace'
  }
}

function buildFallbackObjectiveDetail(input: CreateAgentObjectiveInput): AgentObjectiveDetail {
  const ownerRole = fallbackOwnerRoleForObjective(input)

  return {
    objectiveId: '',
    title: input.title,
    objectiveKind: input.objectiveKind,
    status: 'in_progress',
    prompt: input.prompt,
    initiatedBy: input.initiatedBy ?? 'operator',
    ownerRole,
    mainThreadId: '',
    riskLevel: input.riskLevel ?? 'medium',
    budget: input.budget ?? null,
    requiresOperatorInput: false,
    createdAt: '',
    updatedAt: '',
    threads: [],
    participants: [],
    proposals: [],
    checkpoints: [],
    subagents: [],
    toolExecutions: []
  }
}

export function getObjectiveClient(): ObjectiveClient {
  return {
    createAgentObjective: bridgeMethod('createAgentObjective', async (input: CreateAgentObjectiveInput) => buildFallbackObjectiveDetail(input)),
    refreshObjectiveTriggers: bridgeMethod('refreshObjectiveTriggers', async () => [] as AgentObjectiveDetail[]),
    listAgentObjectives: bridgeMethod('listAgentObjectives', async (_input?: ListAgentObjectivesInput) => [] as AgentObjectiveRecord[]),
    getAgentObjective: bridgeMethod('getAgentObjective', async (_input: GetAgentObjectiveInput) => null as AgentObjectiveDetail | null),
    getAgentThread: bridgeMethod('getAgentThread', async (_input: GetAgentThreadInput) => null as AgentThreadDetail | null),
    respondToAgentProposal: bridgeMethod('respondToAgentProposal', async (_input: RespondToAgentProposalInput) => null as AgentProposalRecord | null),
    confirmAgentProposal: bridgeMethod('confirmAgentProposal', async (_input: ConfirmAgentProposalInput) => null as AgentProposalRecord | null),
    listAgentMemories: bridgeMethod('listAgentMemories', async () => [] as AgentMemoryRecord[]),
    listAgentPolicyVersions: bridgeMethod('listAgentPolicyVersions', async () => [] as AgentPolicyVersionRecord[])
  }
}
