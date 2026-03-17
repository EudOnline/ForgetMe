import type {
  ApprovedDraftSendDestination,
  ApprovedPersonaDraftHandoffRecord,
  ApprovedPersonaDraftProviderSendArtifact
} from '../../shared/archiveContracts'

function formatPayload(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2)
}

export function ApprovedPersonaDraftHandoffPanel(props: {
  destination: string | null
  sendDestinations: ApprovedDraftSendDestination[]
  selectedSendDestinationId: string | null
  handoffs: ApprovedPersonaDraftHandoffRecord[]
  providerSends: ApprovedPersonaDraftProviderSendArtifact[]
  isPending?: boolean
  onChooseExportDestination?: () => void
  onSendDestinationChange?: (destinationId: string) => void
  onExportApprovedDraft?: () => void
  onSendApprovedDraft?: () => void
}) {
  const latestHandoff = props.handoffs[0] ?? null
  const latestProviderSend = props.providerSends[0] ?? null
  const latestProviderEvent = latestProviderSend?.events[latestProviderSend.events.length - 1] ?? null

  return (
    <section aria-label="Approved Draft Handoff">
      <h3>Approved Draft Handoff</h3>
      <div>{props.destination || 'No export destination selected.'}</div>
      <button
        type="button"
        disabled={props.isPending || !props.onChooseExportDestination}
        onClick={() => props.onChooseExportDestination?.()}
      >
        Choose export destination
      </button>
      <button
        type="button"
        disabled={props.isPending || !props.onExportApprovedDraft}
        onClick={() => props.onExportApprovedDraft?.()}
      >
        Export approved draft
      </button>
      {latestHandoff ? (
        <>
          <p>Exported {latestHandoff.fileName}</p>
          <p>{latestHandoff.exportedAt}</p>
          <p>SHA256: {latestHandoff.sha256}</p>
        </>
      ) : (
        <p>No approved draft exports yet.</p>
      )}
      <section aria-label="Provider Boundary Send">
        <h4>Provider Boundary Send</h4>
        {props.sendDestinations.length ? (
          <label>
            Destination
            <select
              value={props.selectedSendDestinationId ?? props.sendDestinations[0]?.destinationId ?? ''}
              disabled={props.isPending || !props.onSendDestinationChange}
              onChange={(event) => props.onSendDestinationChange?.(event.target.value)}
            >
              {props.sendDestinations.map((destination) => (
                <option key={destination.destinationId} value={destination.destinationId}>
                  {destination.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          disabled={props.isPending || !props.onSendApprovedDraft}
          onClick={() => props.onSendApprovedDraft?.()}
        >
          Send approved draft
        </button>
        {latestProviderSend ? (
          <>
            <p>{latestProviderEvent ? `${latestProviderEvent.eventType} recorded` : 'request recorded'}</p>
            <p>Destination: {latestProviderSend.destinationLabel}</p>
            <p>{latestProviderSend.provider} · {latestProviderSend.model}</p>
            <p>{latestProviderSend.policyKey}</p>
            <p>{latestProviderSend.createdAt}</p>
            {latestProviderSend.events.length > 0 ? (
              <section aria-label="Latest send audit">
                <h5>Latest send audit</h5>
                {latestProviderSend.events.map((event) => (
                  <details key={event.id}>
                    <summary>{event.eventType} · {event.createdAt}</summary>
                    <pre>{formatPayload(event.payload)}</pre>
                  </details>
                ))}
              </section>
            ) : null}
          </>
        ) : (
          <p>No provider sends yet.</p>
        )}
      </section>
    </section>
  )
}
