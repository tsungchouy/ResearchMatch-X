import { ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { emailText, formatDateTime } from '../lib/format'
import { followUpDue, STATUS_LABEL, STATUSES, type OutreachRecord, type OutreachStatus, type RecordPatch } from '../state/tracker'
import { schoolName } from '../types/api'
import { InlineAlert } from './InlineAlert'

interface TrackerItemProps {
  record: OutreachRecord
  today: string
  onUpdate: (id: string, patch: RecordPatch) => void
  onRemove: (record: OutreachRecord) => void
}

export function TrackerItem({ record, today, onUpdate, onRemove }: TrackerItemProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [emailOpen, setEmailOpen] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const base = `rec-${record.id}`
  const due = followUpDue(record, today)

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  async function copy() {
    clearTimeout(copyTimer.current)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(emailText(record.subject, record.body))
      setCopyState('copied')
      copyTimer.current = setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('failed')
      setEmailOpen(true)
    }
  }

  return (
    <li className="tracker-item" aria-labelledby={`${base}-name`}>
      <div className="tracker-item__head">
        <div className="tracker-item__who">
          <p className="match__meta">
            {schoolName(record.schoolId)}
            {record.lab ? ` · ${record.lab}` : ''}
          </p>
          <h2 id={`${base}-name`} className="tracker-item__name">
            {record.name}
            {record.mode === 'demo' && <span className="tag tag--sample">Sample</span>}
          </h2>
        </div>
        <div className="tracker-item__state">
          {due && <span className="badge badge--unknown">Follow-up due</span>}
          <span className="tracker-item__updated">Updated {formatDateTime(record.updatedAt)}</span>
        </div>
      </div>

      <div className="tracker-item__fields">
        <div className="field">
          <label className="field__label" htmlFor={`${base}-status`}>
            Status
          </label>
          <select
            id={`${base}-status`}
            className="select"
            value={record.status}
            onChange={(event) => onUpdate(record.id, { status: event.target.value as OutreachStatus })}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${base}-sent`}>
            Sent on
          </label>
          <input
            id={`${base}-sent`}
            type="date"
            className="input"
            value={record.sentOn ?? ''}
            onChange={(event) => onUpdate(record.id, { sentOn: event.target.value || null })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${base}-follow`}>
            Follow up by
          </label>
          <input
            id={`${base}-follow`}
            type="date"
            className="input"
            value={record.followUpOn ?? ''}
            onChange={(event) => onUpdate(record.id, { followUpOn: event.target.value || null })}
          />
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${base}-notes`}>
          Notes
        </label>
        <textarea
          id={`${base}-notes`}
          className="textarea textarea--notes"
          value={record.notes}
          maxLength={1000}
          placeholder="For example: replied asking for a transcript"
          onChange={(event) => onUpdate(record.id, { notes: event.target.value })}
        />
      </div>

      <details className="tracker-item__email" open={emailOpen} onToggle={(event) => setEmailOpen(event.currentTarget.open)}>
        <summary>Saved email</summary>
        <p className="tracker-item__subject">{record.subject}</p>
        <p className="tracker-item__body">{record.body}</p>
      </details>

      {copyState === 'failed' && (
        <InlineAlert tone="warning">
          <p>Couldn’t copy automatically. Select the saved email above and copy it manually.</p>
        </InlineAlert>
      )}

      <div className="tracker-item__actions">
        <button type="button" className="btn btn-secondary" aria-describedby={`${base}-name`} onClick={copy}>
          {copyState === 'copied' ? 'Copied' : 'Copy email'}
        </button>
        {record.sourceUrl && (
          <a className="text-link" href={record.sourceUrl} target="_blank" rel="noopener noreferrer">
            Source page
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" className="source__icon" />
            <span className="visually-hidden"> (opens in new tab)</span>
          </a>
        )}
        <button type="button" className="btn-text btn-text--danger" aria-describedby={`${base}-name`} onClick={() => onRemove(record)}>
          Remove
        </button>
      </div>
    </li>
  )
}
