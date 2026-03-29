import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useI18n } from '../i18n'

type SelectedImportFile = {
  id: string
  name: string
}

type ImportDropzoneProps = {
  onImport: () => void
  disabled?: boolean
  selectedFiles?: SelectedImportFile[]
  onSelectedFilesChange?: (files: SelectedImportFile[]) => void
}

function toSelectedFiles(fileList: FileList | null): SelectedImportFile[] {
  if (!fileList) {
    return []
  }
  return Array.from(fileList).map((file) => ({
    id: `${file.name}:${file.size}:${file.lastModified}`,
    name: file.name
  }))
}

function mergeSelectedFiles(existing: SelectedImportFile[], incoming: SelectedImportFile[]): SelectedImportFile[] {
  const deduped = new Map(existing.map((file) => [file.id, file]))
  for (const file of incoming) {
    deduped.set(file.id, file)
  }
  return Array.from(deduped.values())
}

export function ImportDropzone(props: ImportDropzoneProps) {
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepthRef = useRef(0)
  const [isDragActive, setIsDragActive] = useState(false)
  const [internalSelectedFiles, setInternalSelectedFiles] = useState<SelectedImportFile[]>([])

  const selectedFiles = props.selectedFiles ?? internalSelectedFiles

  const updateSelectedFiles = (nextFiles: SelectedImportFile[]) => {
    if (props.selectedFiles === undefined) {
      setInternalSelectedFiles(nextFiles)
    }
    props.onSelectedFilesChange?.(nextFiles)
  }

  const addFiles = (incomingFiles: SelectedImportFile[]) => {
    if (incomingFiles.length === 0) {
      return
    }
    updateSelectedFiles(mergeSelectedFiles(selectedFiles, incomingFiles))
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(toSelectedFiles(event.target.files))
    event.target.value = ''
  }

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current += 1
    setIsDragActive(true)
  }

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragActive(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = 0
    setIsDragActive(false)
    addFiles(toSelectedFiles(event.dataTransfer.files))
  }

  return (
    <section className="fmImportDropzone">
      <div
        className="fmImportDropzoneSurface"
        data-drag-active={isDragActive ? 'true' : 'false'}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="fmImportDropzoneHeader">
          <h2>{t('import.surface.title')}</h2>
          <p>{t('import.supportedFormats')}</p>
        </div>
        <div className="fmImportDropzoneActions">
          <button
            type="button"
            onClick={() => {
              fileInputRef.current?.click()
            }}
            disabled={props.disabled}
          >
            {t('import.surface.addSelection')}
          </button>
          <button type="button" onClick={props.onImport} disabled={props.disabled}>
            {t('import.chooseFiles')}
          </button>
          <button
            type="button"
            onClick={() => {
              updateSelectedFiles([])
            }}
            disabled={props.disabled || selectedFiles.length === 0}
          >
            {t('import.surface.clearAll')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            onChange={handleInputChange}
            accept=".json,.txt,.jpg,.jpeg,.png,.heic,.pdf,.docx"
          />
        </div>
        <p className="fmImportDropzoneHint">
          {isDragActive ? t('import.surface.dragActive') : t('import.surface.dragHint')}
        </p>
      </div>
      <section className="fmImportDropzoneSelection" aria-label={t('import.surface.selectionRegion')}>
        <h3>{t('import.surface.selectedCount', { count: selectedFiles.length })}</h3>
        {selectedFiles.length === 0 ? (
          <p>{t('import.surface.empty')}</p>
        ) : (
          <ul>
            {selectedFiles.map((file) => (
              <li key={file.id}>
                <span>{file.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    updateSelectedFiles(selectedFiles.filter((selectedFile) => selectedFile.id !== file.id))
                  }}
                  disabled={props.disabled}
                >
                  {t('import.surface.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
