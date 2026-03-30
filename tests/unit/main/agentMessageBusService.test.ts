import { describe, expect, it } from 'vitest'
import { queueThreadDeliveries } from '../../../src/main/services/agentMessageBusService'

describe('agentMessageBusService', () => {
  it('broadcasts a thread message to all target participants except the sender', () => {
    const nextDeliveries = queueThreadDeliveries({
      threadId: 'thread-1',
      messageId: 'message-1',
      from: 'facilitator',
      participantIds: ['review', 'workspace', 'governance'],
      kind: 'proposal'
    })

    expect(nextDeliveries.map((delivery) => delivery.to)).toEqual(['review', 'workspace', 'governance'])
  })

  it('routes direct messages to only the addressed participant', () => {
    const nextDeliveries = queueThreadDeliveries({
      threadId: 'thread-1',
      messageId: 'message-2',
      from: 'workspace',
      to: 'governance',
      participantIds: ['review', 'workspace', 'governance'],
      kind: 'challenge',
      blocking: true
    })

    expect(nextDeliveries).toEqual([
      {
        threadId: 'thread-1',
        messageId: 'message-2',
        from: 'workspace',
        to: 'governance',
        kind: 'challenge',
        blocking: true
      }
    ])
  })
})
