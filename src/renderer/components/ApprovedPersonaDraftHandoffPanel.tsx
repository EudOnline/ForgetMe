import type {
  ApprovedPersonaDraftHandoffRecord,
  ApprovedPersonaDraftProviderSendArtifact
} from '../../shared/archiveContracts'

export function ApprovedPersonaDraftHandoffPanel(props: {
  destination: string | null
  handoffs: ApprovedPersonaDraftHandoffRecord[]
  providerSends: ApprovedPersonaDraftProviderSendArtifact[]
  isPending?: boolean
  onChooseExportDestination?: () => void
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
            <p>{latestProviderSend.provider} · {latestProviderSend.model}</p>
            <p>{latestProviderSend.policyKey}</p>
            <p>{latestProviderSend.createdAt}</p>
          </>
        ) : (
          <p>No provider sends yet.</p>
        )}
      </section>
    </section>
  )
}
