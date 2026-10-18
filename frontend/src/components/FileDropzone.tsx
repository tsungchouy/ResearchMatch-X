import { Upload } from 'lucide-react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { validatePdf } from '../lib/format'

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface FileDropzoneProps {
  file: File | null
  error: string | null
  onFile: (file: File | null) => void
  onLocalError: (message: string | null) => void
  onPasteInstead: () => void
  disabled?: boolean
}

export function FileDropzone({ file, error, onFile, onLocalError, onPasteInstead, disabled }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const hintId = useId()
  const errorId = useId()

  function accept(candidate: File | undefined) {
    if (!candidate) return
    const problem = validatePdf(candidate)
    if (problem) {
      onLocalError(problem)
      return
    }
    onLocalError(null)
    onFile(candidate)
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (disabled) return
    accept(event.dataTransfer.files?.[0])
  }

  return (
    <div className="dropzone-field">
      {file ? (
        <div className="file-chip">
          <div className="file-chip__info">
            <span className="file-chip__name" title={file.name}>
              {file.name}
            </span>
            <span className="file-chip__size">{formatSize(file.size)}</span>
          </div>
          <button
            type="button"
            className="btn-text"
            aria-label={`Remove ${file.name}`}
            onClick={() => {
              onFile(null)
              onLocalError(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
            disabled={disabled}
          >
            Remove
          </button>
        </div>
      ) : (
        <div
          className={`dropzone${dragging ? ' is-dragging' : ''}${error ? ' has-error' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            if (!disabled) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Upload size={20} strokeWidth={1.75} aria-hidden="true" className="dropzone__icon" />
          <button
            type="button"
            className="btn-link"
            onClick={() => inputRef.current?.click()}
            aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
            disabled={disabled}
          >
            Choose PDF
          </button>
          <p id={hintId} className="dropzone__hint">
            or drop it here · 5 MB max
          </p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="resume-file-input"
        onChange={(event) => accept(event.target.files?.[0])}
      />
      {error && (
        <div id={errorId} className="field-error dropzone__error" role="alert">
          <span>{error}</span>{' '}
          <button type="button" className="btn-link" onClick={onPasteInstead}>
            Paste text instead
          </button>
        </div>
      )}
    </div>
  )
}
