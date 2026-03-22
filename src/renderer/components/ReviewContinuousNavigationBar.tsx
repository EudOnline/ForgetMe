import { useI18n } from '../i18n'

export function ReviewContinuousNavigationBar(props: {
  currentIndex: number
  totalCount: number
  canGoPrevious: boolean
  canGoNext: boolean
  onPrevious?: () => void | Promise<void>
  onNext?: () => void | Promise<void>
}) {
  const { t } = useI18n()

  return (
    <section>
      <h2>{t('reviewWorkbench.nav.title')}</h2>
      <div className="fmButtonRow">
        <button type="button" onClick={() => void props.onPrevious?.()} disabled={!props.canGoPrevious}>
          {t('reviewWorkbench.nav.previous')}
        </button>
        <span>{props.currentIndex} / {props.totalCount}</span>
        <button type="button" onClick={() => void props.onNext?.()} disabled={!props.canGoNext}>
          {t('reviewWorkbench.nav.next')}
        </button>
        <span>{t('reviewWorkbench.nav.hint')}</span>
      </div>
    </section>
  )
}
