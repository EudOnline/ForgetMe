export function OCRTextPanel(props: { rawText: string }) {
  return (
    <section>
      <h3>OCR Text</h3>
      <pre>{props.rawText || 'No OCR text available.'}</pre>
    </section>
  )
}
