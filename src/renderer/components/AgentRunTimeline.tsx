import type { AgentMessageRecord } from '../../shared/archiveContracts'

type AgentRunTimelineProps = {
  title: string
  emptyLabel: string
  messages: AgentMessageRecord[]
}

export function AgentRunTimeline({
  title,
  emptyLabel,
  messages
}: AgentRunTimelineProps) {
  const orderedMessages = [...messages].sort((left, right) => left.ordinal - right.ordinal)

  return (
    <section className="fmAgentTimeline" aria-label={title}>
      <h3>{title}</h3>
      {orderedMessages.length === 0 ? (
        <p>{emptyLabel}</p>
      ) : (
        <ol className="fmAgentTimelineList">
          {orderedMessages.map((message) => (
            <li key={message.messageId} className="fmAgentTimelineItem">
              <span className="fmAgentTimelineSender">{message.sender}</span>
              <p className="fmAgentTimelineContent">{message.content}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
