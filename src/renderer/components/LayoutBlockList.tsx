import { useI18n } from '../i18n'

export function LayoutBlockList(props: {
  blocks: Array<{
    page: number
    text: string
    bbox?: number[]
  }>
}) {
  const { t } = useI18n()

  return (
    <section>
      <h3>{t('documentEvidence.layoutBlocks')}</h3>
      {props.blocks.length === 0 ? <p>{t('documentEvidence.noLayoutBlocks')}</p> : null}
      <ul>
        {props.blocks.map((block, index) => (
          <li key={`${block.page}-${index}`}>
            {t('documentEvidence.pageLabel', { page: block.page, text: block.text })}
          </li>
        ))}
      </ul>
    </section>
  )
}
