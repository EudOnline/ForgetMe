import { useI18n } from '../i18n'

export function OCRTextPanel(props: { rawText: string }) {
  const { t } = useI18n()

  return (
    <section>
      <h3>{t('documentEvidence.ocrText')}</h3>
      <pre>{props.rawText || t('documentEvidence.noOcrText')}</pre>
    </section>
  )
}
