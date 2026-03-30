import { describe, expect, it } from 'vitest'
import type { AgentMessageRecordV2, AgentThreadParticipantRecord } from '../../../src/shared/archiveContracts'
import { expandMessageDeliveries } from '../../../src/main/services/agentMessageBusService'

const participants: AgentThreadParticipantRecord[] = [
  {
    threadParticipantId: 'participant-review',
    objectiveId: 'objective-1',
    threadId: 'thread-1',
    participantKind: 'role',
    participantId: 'review',
    role: 'review',
    displayLabel: 'Review owner',
    invitedByParticipantId: null,
    joinedAt: '2026-03-30T10:00:00.000Z',
    leftAt: null
  },
  {
    threadParticipantId: 'participant-workspace',
    objectiveId: 'objective-1',
    threadId: 'thread-1',
    participantKind: 'role',
    participantId: 'workspace',
    role: 'workspace',
    displayLabel: 'Workspace analyst',
    invitedByParticipantId: null,
    joinedAt: '2026-03-30T10:00:01.000Z',
    leftAt: null
  },
  {
    threadParticipantId: 'participant-governance',
    objectiveId: 'objective-1',
    threadId: 'thread-1',
    participantKind: 'role',
    participantId: 'governance',
    role: 'governance',
    displayLabel: 'Governance gate',
    invitedByParticipantId: null,
    joinedAt: '2026-03-30T10:00:02.000Z',
    leftAt: null
  }
]

describe('agent message bus service', () => {
  it('broadcasts thread messages to all active participants except the sender', () => {
    const message: AgentMessageRecordV2 = {
      messageId: 'message-1',
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      fromParticipantId: 'facilitator',
      toParticipantId: null,
      kind: 'question',
      body: 'Who needs to weigh in before we commit this proposal?',
      refs: [],
      replyToMessageId: null,
      round: 1,
      confidence: null,
      blocking: false,
      createdAt: '2026-03-30T10:01:00.000Z'
    }

    const nextDeliveries = expandMessageDeliveries({
      message,
      participants
    })

    expect(nextDeliveries.map((delivery) => delivery.to)).toEqual(['review', 'workspace', 'governance'])
  })

  it('routes direct messages to a single participant', () => {
    const message: AgentMessageRecordV2 = {
      messageId: 'message-2',
      objectiveId: 'objective-1',
      threadId: 'thread-1',
      fromParticipantId: 'workspace',
      toParticipantId: 'governance',
      kind: 'risk_notice',
      body: 'Please review the external-verification risk.',
      refs: [],
      replyToMessageId: null,
      round: 1,
      confidence: 0.72,
      blocking: false,
      createdAt: '2026-03-30T10:02:00.000Z'
    }

    const nextDeliveries = expandMessageDeliveries({
      message,
      participants
    })

    expect(nextDeliveries).toEqual([
      expect.objectContaining({
        messageId: 'message-2',
        to: 'governance'
      })
    ])
  })
})
