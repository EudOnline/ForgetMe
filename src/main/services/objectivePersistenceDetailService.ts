import type {
  AgentCheckpointRecord,
  AgentMessageRecordV2,
  AgentObjectiveRecord,
  AgentProposalRecord,
  AgentSubagentRecord,
  AgentThreadParticipantRecord,
  AgentThreadRecord,
  AgentToolExecutionRecord,
  AgentVoteRecord,
  GetAgentObjectiveInput,
  GetAgentThreadInput
} from '../../shared/objectiveRuntimeContracts'
import type { ArchiveDatabase } from './db'
import {
  getObjectiveRow,
  getThreadRow,
  listCheckpointRowsByObjective,
  listCheckpointRowsByThread,
  listMessageRows,
  listParticipantRowsForObjective,
  listProposalRowsByObjective,
  listProposalRowsByThread,
  listSubagentRowsByObjective,
  listSubagentRowsByThread,
  listThreadParticipantRows,
  listThreadRowsForObjective,
  listToolExecutionRowsByObjective,
  listToolExecutionRowsByThread,
  listVoteRows,
  mapCheckpointRow,
  mapMessageRow,
  mapObjectiveRow,
  mapProposalRow,
  mapSubagentRow,
  mapThreadParticipantRow,
  mapThreadRow,
  mapToolExecutionRow,
  mapVoteRow
} from './objectivePersistenceQueryService'

type ObjectiveDetail = AgentObjectiveRecord & {
  threads: AgentThreadRecord[]
  participants: AgentThreadParticipantRecord[]
  proposals: AgentProposalRecord[]
  checkpoints: AgentCheckpointRecord[]
  subagents: AgentSubagentRecord[]
  toolExecutions?: AgentToolExecutionRecord[]
}

type ThreadDetail = AgentThreadRecord & {
  participants: AgentThreadParticipantRecord[]
  messages: AgentMessageRecordV2[]
  proposals: AgentProposalRecord[]
  votes: AgentVoteRecord[]
  checkpoints: AgentCheckpointRecord[]
  subagents: AgentSubagentRecord[]
  toolExecutions?: AgentToolExecutionRecord[]
}

export function getObjectiveDetail(db: ArchiveDatabase, input: GetAgentObjectiveInput): ObjectiveDetail | null {
  const objectiveRow = getObjectiveRow(db, input.objectiveId)
  if (!objectiveRow) {
    return null
  }

  const objective = mapObjectiveRow(objectiveRow)

  return {
    ...objective,
    threads: listThreadRowsForObjective(db, input.objectiveId).map(mapThreadRow),
    participants: listParticipantRowsForObjective(db, input.objectiveId).map(mapThreadParticipantRow),
    proposals: listProposalRowsByObjective(db, input.objectiveId).map(mapProposalRow),
    checkpoints: listCheckpointRowsByObjective(db, input.objectiveId).map(mapCheckpointRow),
    subagents: listSubagentRowsByObjective(db, input.objectiveId).map(mapSubagentRow),
    toolExecutions: listToolExecutionRowsByObjective(db, input.objectiveId).map(mapToolExecutionRow)
  }
}

export function getThreadDetail(db: ArchiveDatabase, input: GetAgentThreadInput): ThreadDetail | null {
  const threadRow = getThreadRow(db, input.threadId)
  if (!threadRow) {
    return null
  }

  return {
    ...mapThreadRow(threadRow),
    participants: listThreadParticipantRows(db, input.threadId).map(mapThreadParticipantRow),
    messages: listMessageRows(db, input.threadId).map(mapMessageRow),
    proposals: listProposalRowsByThread(db, input.threadId).map(mapProposalRow),
    votes: listVoteRows(db, input.threadId).map(mapVoteRow),
    checkpoints: listCheckpointRowsByThread(db, input.threadId).map(mapCheckpointRow),
    subagents: listSubagentRowsByThread(db, input.threadId).map(mapSubagentRow),
    toolExecutions: listToolExecutionRowsByThread(db, input.threadId).map(mapToolExecutionRow)
  }
}

export type AgentObjectiveDetail = ObjectiveDetail
export type AgentThreadDetail = ThreadDetail
