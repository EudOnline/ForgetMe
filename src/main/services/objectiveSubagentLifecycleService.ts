import type { createSubagentRegistryService } from './subagentRegistryService'
import {
  addThreadParticipants,
  createCheckpoint,
  createSubagent,
  createSubthread,
  getThreadDetail,
  updateSubagent,
  updateThreadStatus
} from './objectivePersistenceService'
import type {
  AgentArtifactRef,
  AgentMessageKind,
  AgentParticipantKind,
  AgentProposalRecord,
  AgentRole,
  AgentSkillPackId
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'

type SubagentRegistryService = ReturnType<typeof createSubagentRegistryService>

export function createObjectiveSubagentLifecycleService(dependencies: {
  db: ArchiveDatabase
  subagentRegistry: SubagentRegistryService
  appendRuntimeMessage: (input: {
    objectiveId: string
    threadId: string
    fromParticipantId: string
    toParticipantId?: string | null
    kind: AgentMessageKind
    body: string
    refs?: AgentArtifactRef[]
    blocking?: boolean
    confidence?: number | null
  }) => unknown
}) {
  const { db } = dependencies

  function buildChildSubthreadParticipants(input: {
    parentThreadId: string
    requestedByParticipantId: string
    ownerRole: AgentRole
    childSubagentId: string
    childDisplayLabel: string
  }) {
    const parentThread = getThreadDetail(db, { threadId: input.parentThreadId })
    const requester = parentThread?.participants.find((participant) => (
      participant.participantId === input.requestedByParticipantId
    ))

    if (!requester && input.requestedByParticipantId !== input.ownerRole) {
      throw new Error(`requesting participant not found in parent thread: ${input.requestedByParticipantId}`)
    }

    const participants = [] as Array<{
      participantKind: AgentParticipantKind
      participantId: string
      role: AgentRole | null
      displayLabel: string
    }>

    const pushParticipant = (participant: {
      participantKind: AgentParticipantKind
      participantId: string
      role: AgentRole | null
      displayLabel: string
    }) => {
      if (participants.some((candidate) => candidate.participantId === participant.participantId)) {
        return
      }

      participants.push(participant)
    }

    if (requester) {
      pushParticipant({
        participantKind: requester.participantKind,
        participantId: requester.participantId,
        role: requester.role,
        displayLabel: requester.displayLabel
      })
    } else {
      pushParticipant({
        participantKind: 'role',
        participantId: input.ownerRole,
        role: input.ownerRole,
        displayLabel: input.ownerRole
      })
    }

    pushParticipant({
      participantKind: 'role',
      participantId: input.ownerRole,
      role: input.ownerRole,
      displayLabel: input.ownerRole
    })
    pushParticipant({
      participantKind: 'subagent',
      participantId: input.childSubagentId,
      role: null,
      displayLabel: input.childDisplayLabel
    })

    return participants
  }

  function startRegisteredSubagentExecution(input: {
    proposal: AgentProposalRecord
    requestedByParticipantId: string
    specialization: AgentSkillPackId
    title: string
    goalBody: string
    toolPolicyId: string
    executionBudget: {
      maxRounds: number
      maxToolCalls: number
      timeoutMs: number
    }
    spawnSummary: string
  }) {
    const subthread = createSubthread(db, {
      objectiveId: input.proposal.objectiveId,
      parentThreadId: input.proposal.threadId,
      ownerRole: input.proposal.ownerRole,
      title: input.title,
      status: 'open'
    })

    const registeredSubagent = dependencies.subagentRegistry.createSubagent({
      objectiveId: input.proposal.objectiveId,
      threadId: subthread.threadId,
      parentThreadId: input.proposal.threadId,
      parentAgentRole: input.proposal.ownerRole,
      specialization: input.specialization,
      budget: { ...input.executionBudget }
    })

    addThreadParticipants(db, {
      objectiveId: input.proposal.objectiveId,
      threadId: input.proposal.threadId,
      invitedByParticipantId: input.requestedByParticipantId,
      participants: [
        {
          participantKind: 'subagent',
          participantId: registeredSubagent.subagentId,
          role: null,
          displayLabel: registeredSubagent.specialization
        }
      ]
    })

    addThreadParticipants(db, {
      objectiveId: input.proposal.objectiveId,
      threadId: subthread.threadId,
      invitedByParticipantId: input.requestedByParticipantId,
      participants: buildChildSubthreadParticipants({
        parentThreadId: input.proposal.threadId,
        requestedByParticipantId: input.requestedByParticipantId,
        ownerRole: input.proposal.ownerRole,
        childSubagentId: registeredSubagent.subagentId,
        childDisplayLabel: registeredSubagent.specialization
      })
    })

    const createdSubagent = createSubagent(db, {
      subagentId: registeredSubagent.subagentId,
      objectiveId: registeredSubagent.objectiveId,
      threadId: subthread.threadId,
      parentThreadId: registeredSubagent.parentThreadId,
      parentAgentRole: registeredSubagent.parentAgentRole,
      specialization: registeredSubagent.specialization,
      skillPackIds: registeredSubagent.skillPackIds,
      toolPolicyId: input.toolPolicyId,
      budget: registeredSubagent.budget,
      expectedOutputSchema: registeredSubagent.outputSchema,
      status: 'running'
    })

    createCheckpoint(db, {
      objectiveId: input.proposal.objectiveId,
      threadId: input.proposal.threadId,
      checkpointKind: 'subagent_spawned',
      title: 'Subagent spawned',
      summary: input.spawnSummary,
      relatedProposalId: input.proposal.proposalId
    })

    dependencies.appendRuntimeMessage({
      objectiveId: input.proposal.objectiveId,
      threadId: subthread.threadId,
      fromParticipantId: input.requestedByParticipantId,
      toParticipantId: createdSubagent.subagentId,
      kind: 'goal',
      body: input.goalBody
    })

    return {
      subthread,
      createdSubagent
    }
  }

  function completeRegisteredSubagentExecution(input: {
    proposal: AgentProposalRecord
    subthread: ReturnType<typeof createSubthread>
    createdSubagent: ReturnType<typeof createSubagent>
    summary: string
    refs: AgentArtifactRef[]
    checkpointKind: 'tool_action_executed' | 'external_verification_completed' | 'user_facing_result_prepared'
    checkpointTitle: string
    checkpointSummary: string
  }) {
    dependencies.appendRuntimeMessage({
      objectiveId: input.proposal.objectiveId,
      threadId: input.subthread.threadId,
      fromParticipantId: input.createdSubagent.subagentId,
      kind: 'final_response',
      body: input.summary,
      refs: input.refs
    })

    dependencies.appendRuntimeMessage({
      objectiveId: input.proposal.objectiveId,
      threadId: input.proposal.threadId,
      fromParticipantId: input.createdSubagent.subagentId,
      kind: 'evidence_response',
      body: input.summary,
      refs: input.refs
    })

    const completedSubagent = updateSubagent(db, {
      subagentId: input.createdSubagent.subagentId,
      status: 'completed',
      summary: input.summary
    })
    const completedSubthread = updateThreadStatus(db, {
      threadId: input.subthread.threadId,
      status: 'completed'
    })

    createCheckpoint(db, {
      objectiveId: input.proposal.objectiveId,
      threadId: input.proposal.threadId,
      checkpointKind: input.checkpointKind,
      title: input.checkpointTitle,
      summary: input.checkpointSummary,
      relatedProposalId: input.proposal.proposalId,
      artifactRefs: input.refs
    })

    return {
      subagent: completedSubagent ?? input.createdSubagent,
      subthread: completedSubthread ?? input.subthread
    }
  }

  function failRegisteredSubagentExecution(input: {
    subthreadId: string
    subagentId: string
    summary: string
  }) {
    updateSubagent(db, {
      subagentId: input.subagentId,
      status: 'failed',
      summary: input.summary
    })
    updateThreadStatus(db, {
      threadId: input.subthreadId,
      status: 'blocked'
    })
  }

  return {
    startRegisteredSubagentExecution,
    completeRegisteredSubagentExecution,
    failRegisteredSubagentExecution
  }
}
