import type {
  AgentMemoryRecord,
  AgentPolicyVersionRecord,
  AgentProposalRecord,
  AgentRole,
  ObjectiveRuntimeAlertRecord,
  ObjectiveRuntimeEventRecord,
  ObjectiveRuntimeProjectionHealthRecord,
  ObjectiveRuntimeScorecard,
  ObjectiveRuntimeSnapshot,
  ObjectiveRuntimeSettingsRecord
} from '../../shared/archiveContracts'
import type {
  AcknowledgeObjectiveRuntimeAlertInput,
  AgentObjectiveDetail,
  AgentObjectiveRecord,
  AgentThreadDetail,
  ConfirmAgentProposalInput,
  CreateAgentObjectiveInput,
  GetAgentObjectiveInput,
  GetAgentThreadInput,
  ListObjectiveRuntimeAlertsInput,
  ListObjectiveRuntimeEventsInput,
  ListAgentObjectivesInput,
  RespondToAgentProposalInput,
  ResolveObjectiveRuntimeAlertInput,
  UpdateObjectiveRuntimeSettingsInput
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
  | 'getObjectiveRuntimeSnapshot'
  | 'getObjectiveRuntimeScorecard'
  | 'getObjectiveRuntimeProjectionHealth'
  | 'listObjectiveRuntimeEvents'
  | 'listObjectiveRuntimeAlerts'
  | 'acknowledgeObjectiveRuntimeAlert'
  | 'resolveObjectiveRuntimeAlert'
  | 'getObjectiveRuntimeSettings'
  | 'updateObjectiveRuntimeSettings'
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

function buildFallbackRuntimeScorecard(): ObjectiveRuntimeScorecard {
  return {
    totalProposalCount: 0,
    autoCommitCount: 0,
    operatorGatedCount: 0,
    vetoCount: 0,
    blockedCount: 0,
    totalObjectiveCount: 0,
    stalledObjectiveCount: 0,
    completedObjectiveCount: 0,
    criticalGateRate: null,
    vetoRate: null,
    blockedRate: null,
    stalledObjectiveRate: null,
    meanRoundsToCompletion: null,
    operatorBacklogSize: 0,
    budgetExhaustedCount: 0,
    toolTimeoutCount: 0,
    warningAlertCount: 0,
    criticalAlertCount: 0,
    backlogNew24h: 0,
    backlogResolved24h: 0,
    backlogNet24h: 0,
    stalledNew24h: 0,
    stalledResolved24h: 0,
    stalledNet24h: 0,
    blockedNew24h: 0,
    blockedResolved24h: 0,
    blockedNet24h: 0,
    backlogDelta24h: 0,
    stalledDelta24h: 0,
    blockedDelta24h: 0,
    runtimeAuditSummary: {
      topFailureProposalKinds: [],
      topFailureSpecializations: [],
      recoveryExhaustedReasons: [],
      reopenedAlertCount: 0,
      reopenedAlertRate: null
    },
    autoCommitRateByRiskLevel: {
      low: { total: 0, autoCommitted: 0, rate: null },
      medium: { total: 0, autoCommitted: 0, rate: null },
      high: { total: 0, autoCommitted: 0, rate: null },
      critical: { total: 0, autoCommitted: 0, rate: null }
    }
  }
}

function buildFallbackRuntimeSettings(): ObjectiveRuntimeSettingsRecord {
  return {
    disableAutoCommit: false,
    forceOperatorForExternalActions: false,
    disableNestedDelegation: false,
    updatedAt: null,
    updatedBy: null
  }
}

function buildFallbackRuntimeSnapshot(): ObjectiveRuntimeSnapshot {
  return {
    scorecard: buildFallbackRuntimeScorecard(),
    events: [],
    alerts: [],
    projectionHealth: buildFallbackRuntimeProjectionHealth(),
    settings: buildFallbackRuntimeSettings()
  }
}

function buildFallbackRuntimeProjectionHealth(): ObjectiveRuntimeProjectionHealthRecord[] {
  return [
    {
      projectionKey: 'runtime_alerts',
      lastProjectedEventRowId: 0,
      currentEventRowId: 0,
      lagEvents: 0,
      isCurrent: true,
      updatedAt: null
    },
    {
      projectionKey: 'runtime_audit',
      lastProjectedEventRowId: 0,
      currentEventRowId: 0,
      lagEvents: 0,
      isCurrent: true,
      updatedAt: null
    },
    {
      projectionKey: 'runtime_scorecard',
      lastProjectedEventRowId: 0,
      currentEventRowId: 0,
      lagEvents: 0,
      isCurrent: true,
      updatedAt: null
    }
  ]
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
    getObjectiveRuntimeSnapshot: bridgeMethod('getObjectiveRuntimeSnapshot', async () => (
      buildFallbackRuntimeSnapshot()
    )),
    getObjectiveRuntimeScorecard: bridgeMethod('getObjectiveRuntimeScorecard', async () => (
      buildFallbackRuntimeScorecard()
    )),
    getObjectiveRuntimeProjectionHealth: bridgeMethod('getObjectiveRuntimeProjectionHealth', async () => (
      buildFallbackRuntimeProjectionHealth()
    )),
    listObjectiveRuntimeEvents: bridgeMethod('listObjectiveRuntimeEvents', async (_input?: ListObjectiveRuntimeEventsInput) => [] as ObjectiveRuntimeEventRecord[]),
    listObjectiveRuntimeAlerts: bridgeMethod('listObjectiveRuntimeAlerts', async (_input?: ListObjectiveRuntimeAlertsInput) => [] as ObjectiveRuntimeAlertRecord[]),
    acknowledgeObjectiveRuntimeAlert: bridgeMethod('acknowledgeObjectiveRuntimeAlert', async (input: AcknowledgeObjectiveRuntimeAlertInput) => ({
      alertId: input.alertId,
      fingerprint: input.alertId,
      severity: 'warning',
      status: 'acknowledged',
      objectiveId: '',
      proposalId: null,
      firstEventId: '',
      latestEventId: '',
      eventCount: 1,
      title: 'Runtime alert',
      detail: null,
      openedAt: '',
      lastSeenAt: '',
      acknowledgedAt: '',
      acknowledgedBy: input.actor ?? 'operator',
      resolvedAt: null
    } satisfies ObjectiveRuntimeAlertRecord)),
    resolveObjectiveRuntimeAlert: bridgeMethod('resolveObjectiveRuntimeAlert', async (input: ResolveObjectiveRuntimeAlertInput) => ({
      alertId: input.alertId,
      fingerprint: input.alertId,
      severity: 'warning',
      status: 'resolved',
      objectiveId: '',
      proposalId: null,
      firstEventId: '',
      latestEventId: '',
      eventCount: 1,
      title: 'Runtime alert',
      detail: null,
      openedAt: '',
      lastSeenAt: '',
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: ''
    } satisfies ObjectiveRuntimeAlertRecord)),
    getObjectiveRuntimeSettings: bridgeMethod('getObjectiveRuntimeSettings', async () => (
      buildFallbackRuntimeSettings()
    )),
    updateObjectiveRuntimeSettings: bridgeMethod('updateObjectiveRuntimeSettings', async (input: UpdateObjectiveRuntimeSettingsInput) => ({
      disableAutoCommit: input.patch.disableAutoCommit ?? false,
      forceOperatorForExternalActions: input.patch.forceOperatorForExternalActions ?? false,
      disableNestedDelegation: input.patch.disableNestedDelegation ?? false,
      updatedAt: null,
      updatedBy: null
    } satisfies ObjectiveRuntimeSettingsRecord)),
    listAgentMemories: bridgeMethod('listAgentMemories', async () => [] as AgentMemoryRecord[]),
    listAgentPolicyVersions: bridgeMethod('listAgentPolicyVersions', async () => [] as AgentPolicyVersionRecord[])
  }
}
