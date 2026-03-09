export function ImportDropzone(props: { onImport: () => void; disabled?: boolean }) {
  return (
    <section>
      <button onClick={props.onImport} disabled={props.disabled} type="button">
        Choose Files
      </button>
    </section>
  )
}
