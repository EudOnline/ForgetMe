import type {
  ApprovedDraftHostedShareHostStatus,
  ApprovedDraftSendDestination,
  ApprovedPersonaDraftHandoffRecord,
  ApprovedPersonaDraftHostedShareLinkRecord,
  ApprovedPersonaDraftPublicationRecord,
  ApprovedPersonaDraftProviderSendArtifact
} from '../../shared/archiveContracts'

function formatPayload(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2)
}

function attemptLabel(attemptKind: 'initial_send' | 'manual_retry' | 'automatic_retry') {
  if (attemptKind === 'manual_retry') {
    return 'manual retry'
  }

  if (attemptKind === 'automatic_retry') {
    return 'automatic retry'
  }

  return 'initial send'
}

function backgroundRetryStatusLabel(input: {
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed' | 'exhausted'
  autoRetryAttemptIndex: number | null
  maxAutoRetryAttempts: number
}) {
  if (input.status === 'pending') {
    return `Auto retry: queued · attempt ${input.autoRetryAttemptIndex ?? '?'} of ${input.maxAutoRetryAttempts}`
  }

  if (input.status === 'processing') {
    return 'Auto retry: processing'
  }

  if (input.status === 'exhausted') {
    return `Auto retry exhausted after ${input.maxAutoRetryAttempts} attempts`
  }

  return `Auto retry: ${input.status}`
}

export function ApprovedPersonaDraftHandoffPanel(props: {
  destination: string | null
  publicationDestination: string | null
  publicationOpenStatus?: {
    kind: 'success' | 'error'
    message: string
  } | null
  hostedShareHostStatus?: ApprovedDraftHostedShareHostStatus | null
  hostedShareStatus?: {
    kind: 'success' | 'error'
    message: string
  } | null
  sendDestinations: ApprovedDraftSendDestination[]
  selectedSendDestinationId: string | null
  handoffs: ApprovedPersonaDraftHandoffRecord[]
  publications: ApprovedPersonaDraftPublicationRecord[]
  hostedShareLinks: ApprovedPersonaDraftHostedShareLinkRecord[]
  providerSends: ApprovedPersonaDraftProviderSendArtifact[]
  isPending?: boolean
  onChooseExportDestination?: () => void
  onChoosePublicationDestination?: () => void
  onSendDestinationChange?: (destinationId: string) => void
  onExportApprovedDraft?: () => void
  onPublishApprovedDraft?: () => void
  onOpenApprovedDraftPublication?: () => void
  onCreateApprovedDraftHostedShareLink?: () => void
  onOpenApprovedDraftHostedShareLink?: () => void
  onRevokeApprovedDraftHostedShareLink?: () => void
  onSendApprovedDraft?: () => void
  onRetryApprovedDraftSend?: () => void
}) {
  const latestHandoff = props.handoffs[0] ?? null
  const publicationHistory = [...props.publications].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
  const latestPublication = publicationHistory[0] ?? null
  const hostedShareHistory = [...props.hostedShareLinks].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const latestHostedShareLink = hostedShareHistory[0] ?? null
  const latestProviderSend = props.providerSends[0] ?? null
  const latestProviderEvent = latestProviderSend?.events[latestProviderSend.events.length - 1] ?? null
  const latestAttemptLabel = latestProviderSend ? attemptLabel(latestProviderSend.attemptKind) : 'initial send'
  const latestErrorMessage = latestProviderEvent?.eventType === 'error' && typeof latestProviderEvent.payload.message === 'string'
    ? latestProviderEvent.payload.message
    : null
  const latestBackgroundRetry = latestProviderSend?.backgroundRetry ?? null
  const retryActionDisabled = props.isPending || !props.onRetryApprovedDraftSend || latestBackgroundRetry?.status === 'processing'

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
      <section aria-label="Publish / Share">
        <h4>Publish / Share</h4>
        <div>{props.publicationDestination || 'No publish destination selected.'}</div>
        {props.onChoosePublicationDestination ? (
          <button
            type="button"
            disabled={props.isPending}
            onClick={() => props.onChoosePublicationDestination?.()}
          >
            Choose publish destination
          </button>
        ) : null}
        {props.onPublishApprovedDraft ? (
          <button
            type="button"
            disabled={props.isPending}
            onClick={() => props.onPublishApprovedDraft?.()}
          >
            Publish approved draft
          </button>
        ) : null}
        {latestPublication ? (
          <>
            <p>Published {latestPublication.publicArtifactFileName}</p>
            <p>Entry page: {latestPublication.displayEntryFileName}</p>
            <p>Data payload: {latestPublication.publicArtifactFileName}</p>
            <p>{latestPublication.publishedAt}</p>
            <p>SHA256: {latestPublication.publicArtifactSha256}</p>
            {props.onOpenApprovedDraftPublication ? (
              <button
                type="button"
                disabled={props.isPending}
                onClick={() => props.onOpenApprovedDraftPublication?.()}
              >
                Open share page
              </button>
            ) : null}
            {props.publicationOpenStatus ? (
              <p role={props.publicationOpenStatus.kind === 'error' ? 'alert' : 'status'}>
                {props.publicationOpenStatus.message}
              </p>
            ) : null}
            <section aria-label="Publication history">
              <h5>Publication history</h5>
              <ul>
                {publicationHistory.map((publication) => (
                  <li key={publication.journalId}>
                    <p>{publication.displayEntryFileName} · {publication.publishedAt}</p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <p>No approved draft publications yet.</p>
        )}
        <section aria-label="Hosted Share Link">
          <h5>Hosted Share Link</h5>
          {!latestPublication ? (
            <p>Publish approved draft to create a local package before hosting</p>
          ) : props.hostedShareHostStatus?.availability === 'unconfigured' ? (
            <p>Hosted share link is unavailable until a share host is configured</p>
          ) : null}
          {latestPublication && props.hostedShareHostStatus?.availability === 'configured' && !latestHostedShareLink && props.onCreateApprovedDraftHostedShareLink ? (
            <button
              type="button"
              disabled={props.isPending}
              onClick={() => props.onCreateApprovedDraftHostedShareLink?.()}
            >
              Create hosted share link
            </button>
          ) : null}
          {latestHostedShareLink ? (
            <>
              <p>{latestHostedShareLink.shareUrl}</p>
              <p>Status: {latestHostedShareLink.status}</p>
              <p>Created: {latestHostedShareLink.createdAt}</p>
              <p>Host: {latestHostedShareLink.hostLabel}</p>
              {props.onOpenApprovedDraftHostedShareLink ? (
                <button
                  type="button"
                  disabled={props.isPending}
                  onClick={() => props.onOpenApprovedDraftHostedShareLink?.()}
                >
                  Open hosted share link
                </button>
              ) : null}
              {latestHostedShareLink.status === 'active' && props.onRevokeApprovedDraftHostedShareLink ? (
                <button
                  type="button"
                  disabled={props.isPending}
                  onClick={() => props.onRevokeApprovedDraftHostedShareLink?.()}
                >
                  Revoke hosted share link
                </button>
              ) : null}
              <section aria-label="Hosted share link history">
                <h6>History</h6>
                <ul>
                  {hostedShareHistory.map((link) => (
                    <li key={link.shareLinkId}>
                      <p>{link.status} · {link.revokedAt ?? link.createdAt}</p>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}
          {props.hostedShareStatus ? (
            <p role={props.hostedShareStatus.kind === 'error' ? 'alert' : 'status'}>
              {props.hostedShareStatus.message}
            </p>
          ) : null}
        </section>
      </section>
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
        {latestProviderEvent?.eventType === 'error' ? (
          <button
            type="button"
            disabled={retryActionDisabled}
            onClick={() => props.onRetryApprovedDraftSend?.()}
          >
            Retry failed send now
          </button>
        ) : null}
        {latestProviderSend ? (
          <>
            <p>{latestProviderEvent ? `${latestProviderEvent.eventType} recorded` : 'request recorded'}</p>
            <p>Attempt: {latestAttemptLabel}</p>
            <p>Destination: {latestProviderSend.destinationLabel}</p>
            <p>{latestProviderSend.provider} · {latestProviderSend.model}</p>
            <p>{latestProviderSend.policyKey}</p>
            <p>{latestProviderSend.createdAt}</p>
            {latestBackgroundRetry ? (
              <p>{backgroundRetryStatusLabel(latestBackgroundRetry)}</p>
            ) : null}
            {latestBackgroundRetry?.nextRetryAt ? (
              <p>Next retry: {latestBackgroundRetry.nextRetryAt}</p>
            ) : null}
            {latestErrorMessage ? (
              <p>Error: {latestErrorMessage}</p>
            ) : null}
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
