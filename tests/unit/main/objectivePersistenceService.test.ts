import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import {
  addThreadParticipants,
  appendAgentMessageV2,
  createCheckpoint,
  createMainThread,
  createObjective,
  createProposal,
  createSubagent,
  getObjectiveDetail,
  getThreadDetail,
  listObjectives,
  recordProposalVote
} from '../../../src/main/services/objectivePersistenceService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-persistence-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('objective persistence service', () => {
  it('creates an objective with its main thread and persists thread participants', () => {
    const db = setupDatabase()

    const objective = createObjective(db, {
      title: 'Verify approval safety',
      objectiveKind: 'review_decision',
      prompt: 'Decide whether this candidate can be approved safely.',
      initiatedBy: 'operator',
      ownerRole: 'review',
      riskLevel: 'high',
      requiresOperatorInput: true,
      budget: {
        maxRounds: 4,
        maxToolCalls: 2,
        timeoutMs: 60_000
      }
    })

    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'review',
      title: 'Main review deliberation'
    })

    const participants = addThreadParticipants(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      participants: [
        {
          participantKind: 'role',
          participantId: 'review',
          role: 'review',
          displayLabel: 'Review owner'
        },
        {
          participantKind: 'role',
          participantId: 'workspace',
          role: 'workspace',
          displayLabel: 'Workspace analyst'
        },
        {
          participantKind: 'role',
          participantId: 'governance',
          role: 'governance',
          displayLabel: 'Governance gate'
        }
      ]
    })

    const listedObjectives = listObjectives(db, { status: 'open' })
    const objectiveDetail = getObjectiveDetail(db, { objectiveId: objective.objectiveId })
    const threadDetail = getThreadDetail(db, { threadId: thread.threadId })

    expect(objective.objectiveId).toBeTruthy()
    expect(thread.threadKind).toBe('main')
    expect(participants).toHaveLength(3)
    expect(listedObjectives.map((entry) => entry.objectiveId)).toContain(objective.objectiveId)
    expect(objectiveDetail?.mainThreadId).toBe(thread.threadId)
    expect(threadDetail?.participants.map((participant) => participant.role)).toEqual([
      'review',
      'workspace',
      'governance'
    ])

    db.close()
  })

  it('round-trips messages proposals votes checkpoints and subagents', () => {
    const db = setupDatabase()

    const objective = createObjective(db, {
      title: 'Verify external claim before response',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check whether the claim can be verified with bounded web evidence.',
      initiatedBy: 'operator',
      ownerRole: 'workspace',
      riskLevel: 'medium'
    })

    const thread = createMainThread(db, {
      objectiveId: objective.objectiveId,
      ownerRole: 'workspace',
      title: 'Main evidence thread'
    })

    addThreadParticipants(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      participants: [
        {
          participantKind: 'role',
          participantId: 'workspace',
          role: 'workspace',
          displayLabel: 'Workspace analyst'
        },
        {
          participantKind: 'role',
          participantId: 'governance',
          role: 'governance',
          displayLabel: 'Governance gate'
        }
      ]
    })

    appendAgentMessageV2(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      fromParticipantId: 'workspace',
      kind: 'goal',
      body: 'We need bounded verification before answering.',
      round: 0,
      createdAt: '2026-03-30T09:00:00.000Z'
    })
    appendAgentMessageV2(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      fromParticipantId: 'workspace',
      kind: 'proposal',
      body: 'Spawn a web-verifier subagent.',
      round: 1,
      createdAt: '2026-03-30T09:01:00.000Z'
    })
    const challengeMessage = appendAgentMessageV2(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      fromParticipantId: 'governance',
      kind: 'challenge',
      body: 'Require bounded tool policy before verification.',
      round: 1,
      blocking: true,
      createdAt: '2026-03-30T09:01:30.000Z'
    })
    appendAgentMessageV2(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      fromParticipantId: 'workspace',
      kind: 'proposal',
      body: 'Re-raised with bounded policy and budget.',
      round: 2,
      createdAt: '2026-03-30T09:02:00.000Z'
    })

    const proposal = createProposal(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposedByParticipantId: 'workspace',
      proposalKind: 'verify_external_claim',
      payload: {
        claim: 'Verify the date from an external authoritative source.'
      },
      ownerRole: 'workspace',
      status: 'under_review',
      requiredApprovals: ['workspace'],
      allowVetoBy: ['governance'],
      requiresOperatorConfirmation: false,
      toolPolicyId: 'tool-policy-web-1',
      budget: {
        maxRounds: 2,
        maxToolCalls: 3,
        timeoutMs: 30_000
      },
      derivedFromMessageIds: [challengeMessage.messageId],
      artifactRefs: []
    })

    const vote = recordProposalVote(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      proposalId: proposal.proposalId,
      voterRole: 'governance',
      vote: 'challenge',
      comment: 'Need a tighter evidence scope before approval.'
    })

    const checkpoint = createCheckpoint(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      checkpointKind: 'proposal_raised',
      title: 'Verification proposal raised',
      summary: 'Workspace requested bounded external verification.',
      relatedMessageId: challengeMessage.messageId,
      relatedProposalId: proposal.proposalId,
      artifactRefs: []
    })

    const subagent = createSubagent(db, {
      objectiveId: objective.objectiveId,
      threadId: thread.threadId,
      parentThreadId: thread.threadId,
      parentAgentRole: 'workspace',
      specialization: 'web-verifier',
      skillPackIds: ['web-verifier'],
      toolPolicyId: 'tool-policy-web-1',
      budget: {
        maxRounds: 2,
        maxToolCalls: 3,
        timeoutMs: 30_000
      },
      expectedOutputSchema: 'webVerificationResultSchema',
      status: 'running'
    })

    const threadDetail = getThreadDetail(db, { threadId: thread.threadId })

    expect(threadDetail?.messages.map((message) => message.round)).toEqual([0, 1, 1, 2])
    expect(threadDetail?.proposals[0]?.proposalKind).toBe('verify_external_claim')
    expect(threadDetail?.votes[0]?.vote).toBe('challenge')
    expect(threadDetail?.checkpoints[0]?.checkpointKind).toBe('proposal_raised')
    expect(threadDetail?.subagents[0]?.skillPackIds).toEqual(['web-verifier'])
    expect(vote.vote).toBe('challenge')
    expect(checkpoint.relatedProposalId).toBe(proposal.proposalId)
    expect(subagent.status).toBe('running')

    db.close()
  })
})
