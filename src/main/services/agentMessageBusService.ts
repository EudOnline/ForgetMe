import type {
  AgentMessageRecordV2,
  AgentThreadParticipantRecord
} from '../../shared/archiveContracts'

export type QueueThreadDeliveriesInput = {
  threadId: string
  messageId: string
  from: string
  kind: string
  participantIds: string[]
  to?: string
  blocking?: boolean
}

export type ThreadDelivery = {
  threadId: string
  messageId: string
  from: string
  kind: string
  to: string
  blocking?: boolean
}

export type ExpandMessageDeliveriesInput = {
  message: Pick<
    AgentMessageRecordV2,
    'threadId' | 'messageId' | 'fromParticipantId' | 'toParticipantId' | 'kind' | 'blocking'
  >
  participants: Array<Pick<AgentThreadParticipantRecord, 'participantId' | 'leftAt'>>
}

export function queueThreadDeliveries(input: QueueThreadDeliveriesInput): ThreadDelivery[] {
  const { threadId, messageId, from, kind, participantIds, to, blocking } = input

  if (to) {
    return [
      {
        threadId,
        messageId,
        from,
        kind,
        to,
        blocking
      }
    ]
  }

  return participantIds
    .filter((participantId) => participantId !== from)
    .map((participantId) => ({
      threadId,
      messageId,
      from,
      kind,
      to: participantId,
      blocking
    }))
}

export function expandMessageDeliveries(input: ExpandMessageDeliveriesInput): ThreadDelivery[] {
  return queueThreadDeliveries({
    threadId: input.message.threadId,
    messageId: input.message.messageId,
    from: input.message.fromParticipantId,
    kind: input.message.kind,
    participantIds: input.participants
      .filter((participant) => participant.leftAt === null)
      .map((participant) => participant.participantId),
    to: input.message.toParticipantId ?? undefined,
    blocking: input.message.blocking
  })
}
