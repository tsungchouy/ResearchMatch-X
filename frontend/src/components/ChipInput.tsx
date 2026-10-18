import { X } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'

interface ChipInputProps {
  id: string
  label: string
  values: string[]
  onChange: (values: string[]) => void
  max: number
  minLength?: number
  maxLength?: number
  hint?: string
  error?: string | null
  placeholder?: string
}

/** Removable text chips with an input; Enter or the Add button adds the typed value. */
export function ChipInput({ id, label, values, onChange, max, minLength = 1, maxLength = 80, hint, error, placeholder }: ChipInputProps) {
  const [draft, setDraft] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const hintId = useId()
  const errorId = useId()
  const shownError = localError ?? error ?? null
  const full = values.length >= max

  function add() {
    const value = draft.trim()
    if (!value) return
    if (value.length < minLength || value.length > maxLength) {
      setLocalError(`Use ${minLength}–${maxLength} characters.`)
      return
    }
    if (values.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      setLocalError('Already added.')
      return
    }
    if (full) {
      setLocalError(`You can add up to ${max}.`)
      return
    }
    onChange([...values, value])
    setDraft('')
    setLocalError(null)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      add()
    } else if (event.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1))
    }
  }

  const describedBy = [hint ? hintId : null, shownError ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {values.length > 0 && (
        <ul className="chips" aria-label={`${label} added`}>
          {values.map((value) => (
            <li key={value} className="chip">
              <span className="chip__text">{value}</span>
              <button
                type="button"
                className="chip__remove"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((item) => item !== value))}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="chip-input">
        <input
          id={id}
          className={`input${shownError ? ' has-error' : ''}`}
          value={draft}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={shownError ? true : undefined}
          disabled={full}
          maxLength={maxLength + 20}
          onChange={(event) => {
            setDraft(event.target.value)
            setLocalError(null)
          }}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="btn btn-secondary" onClick={add} disabled={full || !draft.trim()}>
          Add
        </button>
      </div>
      {full && <p className="field__hint">Limit reached ({max}). Remove one to add another.</p>}
      {shownError && (
        <p id={errorId} className="field-error">
          {shownError}
        </p>
      )}
    </div>
  )
}
