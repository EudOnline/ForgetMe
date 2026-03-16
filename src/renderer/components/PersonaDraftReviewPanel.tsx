import type { MemoryWorkspacePersonaDraftReviewRecord } from '../../shared/archiveContracts'

function formatReviewStatus(status: MemoryWorkspacePersonaDraftReviewRecord['status']) {
  return status.replace(/_/g, ' ')
}

export function PersonaDraftReviewPanel(props: {
  review: MemoryWorkspacePersonaDraftReviewRecord | null
  editedDraft: string
  reviewNotes: string
  isPending?: boolean
  onEditedDraftChange?: (value: string) => void
  onReviewNotesChange?: (value: string) => void
  onStartDraftReview?: () => void
  onSaveDraftEdits?: () => void
  onMarkInReview?: () => void
  onApproveDraft?: () => void
  onRejectDraft?: () => void
}) {
  if (!props.review) {
    return (
      <section aria-label="Draft Review">
        <h3>Draft Review</h3>
        <p>Start a lightweight internal review without changing the original sandbox draft.</p>
        <button
          type="button"
          disabled={props.isPending || !props.onStartDraftReview}
          onClick={() => props.onStartDraftReview?.()}
        >
          Start draft review
        </button>
      </section>
    )
  }

  const isReadOnly = props.review.status === 'approved' || props.review.status === 'rejected'
  const disableEdits = isReadOnly || props.isPending

  return (
    <section aria-label="Draft Review">
      <h3>Draft Review</h3>
      <p>Status: {formatReviewStatus(props.review.status)}</p>
      <label>
        Draft review body
        <textarea
          value={props.editedDraft}
          disabled={disableEdits}
          onChange={(event) => props.onEditedDraftChange?.(event.target.value)}
        />
      </label>
      <label>
        Draft review notes
        <textarea
          value={props.reviewNotes}
          disabled={disableEdits}
          onChange={(event) => props.onReviewNotesChange?.(event.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={disableEdits || !props.onSaveDraftEdits}
        onClick={() => props.onSaveDraftEdits?.()}
      >
        Save draft edits
      </button>
      <button
        type="button"
        disabled={props.isPending || props.review.status !== 'draft' || !props.onMarkInReview}
        onClick={() => props.onMarkInReview?.()}
      >
        Mark in review
      </button>
      <button
        type="button"
        disabled={isReadOnly || props.isPending || !props.onApproveDraft}
        onClick={() => props.onApproveDraft?.()}
      >
        Approve draft
      </button>
      <button
        type="button"
        disabled={isReadOnly || props.isPending || !props.onRejectDraft}
        onClick={() => props.onRejectDraft?.()}
      >
        Reject draft
      </button>
    </section>
  )
}
