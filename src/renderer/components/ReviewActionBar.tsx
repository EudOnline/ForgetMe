import { useI18n } from '../i18n'

export function ReviewActionBar(props: {
  queueStatus: string
  undoJournalId: string | null
  busy?: boolean
  onApprove?: () => void
  onReject?: () => void
  onUndo?: () => void
}) {
  const { t } = useI18n()
  const pending = props.queueStatus === 'pending'

  return (
    <section>
      <h2>{t('reviewWorkbench.actions.title')}</h2>
      <div className="fmButtonRow">
        <button type="button" onClick={() => props.onApprove?.()} disabled={!pending || props.busy}>{t('reviewWorkbench.actions.approve')}</button>
        <button type="button" onClick={() => props.onReject?.()} disabled={!pending || props.busy}>{t('reviewWorkbench.actions.reject')}</button>
        <button type="button" onClick={() => props.onUndo?.()} disabled={!props.undoJournalId || props.busy}>{t('reviewWorkbench.actions.undo')}</button>
      </div>
    </section>
  )
}
