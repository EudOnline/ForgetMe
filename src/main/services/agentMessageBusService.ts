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
