import { useI18n } from '../i18n'

export function ImportDropzone(props: { onImport: () => void; disabled?: boolean }) {
  const { t } = useI18n()

  return (
    <section>
      <button onClick={props.onImport} disabled={props.disabled} type="button">
        {t('import.chooseFiles')}
      </button>
    </section>
  )
}
