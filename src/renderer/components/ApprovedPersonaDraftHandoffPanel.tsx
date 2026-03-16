import type { ApprovedPersonaDraftHandoffRecord } from '../../shared/archiveContracts'

export function ApprovedPersonaDraftHandoffPanel(props: {
  destination: string | null
  handoffs: ApprovedPersonaDraftHandoffRecord[]
  isPending?: boolean
  onChooseExportDestination?: () => void
  onExportApprovedDraft?: () => void
}) {
  const latestHandoff = props.handoffs[0] ?? null

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
    </section>
  )
}
