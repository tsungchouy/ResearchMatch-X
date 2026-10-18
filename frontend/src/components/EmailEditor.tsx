import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { emailText, safeFileName, wordCount } from '../lib/format'
import type { DraftState } from '../state/reducer'
import { InlineAlert } from './InlineAlert'
import { useToast } from './Toast'

/** unsaved: not in the tracker yet · saved: tracker has this exact text · changed: tracker has an older version */
export type TrackerSaveState = 'unsaved' | 'saved' | 'changed'

interface EmailEditorProps {
  draft: DraftState
  candidateId: string
  canGenerate: boolean
  generateHint: string | null
  trackerState: TrackerSaveState
  trackerStatus: string | null
  onGenerate: () => void
  onRegenerate: () => void
  onEdit: (patch: { subject?: string; body?: string }) => void
  onSaveToTracker: () => void
}

const SAVE_LABEL: Record<TrackerSaveState, string> = {
  unsaved: 'Save to tracker',
  saved: 'Saved to tracker',
  changed: 'Update tracker copy',
}

export function EmailEditor({
  draft,
  candidateId,
  canGenerate,
  generateHint,
  trackerState,
  trackerStatus,
  onGenerate,
  onRegenerate,
  onEdit,
  onSaveToTracker,
}: EmailEditorProps) {
  const toast = useToast()
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [downloadFailed, setDownloadFailed] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const loading = draft.status === 'loading'
  const hasDraft = Boolean(draft.email)
  const words = wordCount(draft.body)

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  async function copy() {
    clearTimeout(copyTimer.current)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(emailText(draft.subject, draft.body))
      setCopyState('copied')
      copyTimer.current = setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('failed')
      bodyRef.current?.focus()
      bodyRef.current?.select()
    }
  }

  function download() {
    try {
      const blob = new Blob([emailText(draft.subject, draft.body)], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = safeFileName(candidateId)
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDownloadFailed(false)
      toast(`Downloaded ${safeFileName(candidateId)}`)
    } catch {
      setDownloadFailed(true)
    }
  }

  return (
    <section className="editor" aria-labelledby="editor-title" aria-busy={loading}>
      <div className="editor__header">
        <h2 id="editor-title" className="section__title">
          Email draft
        </h2>
        {draft.email?.mode === 'demo' && <span className="tag tag--sample">Sample draft</span>}
      </div>

      <div aria-live="polite" className="visually-hidden">
        {loading ? 'Writing your draft…' : hasDraft ? 'Draft ready.' : ''}
      </div>

      {draft.error && (
        <InlineAlert tone="error" title="The draft couldn’t be written.">
          <p>
            {draft.error.message}
            {hasDraft ? ' Your current draft is unchanged.' : ''}
          </p>
        </InlineAlert>
      )}

      {draft.stale && hasDraft && (
        <InlineAlert tone="warning" title="Your details changed after this draft was written.">
          <p>Regenerate to use the new details, or keep editing the current draft.</p>
        </InlineAlert>
      )}

      {!hasDraft ? (
        <div className="editor__empty">
          <p>Your draft will appear here after you review the details.</p>
          <div className="editor__actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onGenerate}
              disabled={!canGenerate || loading}
              aria-describedby={generateHint ? 'generate-hint' : undefined}
            >
              {loading ? 'Writing your draft…' : 'Generate draft'}
            </button>
          </div>
          {generateHint && (
            <p id="generate-hint" className="field__hint">
              {generateHint}
            </p>
          )}
        </div>
      ) : (
        <div className="editor__fields">
          <div className="field">
            <label className="field__label" htmlFor="email-subject">
              Subject
            </label>
            <input
              id="email-subject"
              className="input"
              value={draft.subject}
              onChange={(event) => onEdit({ subject: event.target.value })}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="email-body">
              Body
            </label>
            <textarea
              id="email-body"
              ref={bodyRef}
              className="textarea textarea--email"
              value={draft.body}
              aria-describedby="email-count"
              onChange={(event) => onEdit({ body: event.target.value })}
            />
            <p id="email-count" className="field__count">
              {words} words
              {words > 180 ? ' · Suggested length is 120–180 words' : words < 120 ? ' · Suggested length is 120–180 words' : ''}
              {draft.edited ? ' · Edited by you' : ''}
            </p>
          </div>
          <div className="editor__actions">
            <button type="button" className="btn btn-primary" onClick={copy}>
              {copyState === 'copied' ? 'Copied' : 'Copy email'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={download}>
              Download .txt
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              aria-disabled={trackerState === 'saved' || undefined}
              aria-describedby="tracker-note"
              onClick={() => trackerState !== 'saved' && onSaveToTracker()}
            >
              {SAVE_LABEL[trackerState]}
            </button>
            <button
              type="button"
              className="btn-text"
              onClick={onRegenerate}
              disabled={!canGenerate || loading}
              aria-describedby={generateHint ? 'generate-hint' : undefined}
            >
              {loading ? 'Writing your draft…' : 'Regenerate'}
            </button>
          </div>
          <p id="tracker-note" className="field__hint">
            {trackerState === 'unsaved' ? (
              'Keep this email and track replies on this device.'
            ) : (
              <>
                {trackerState === 'changed' ? 'Your tracker has an earlier version of this email. ' : 'In your tracker'}
                {trackerStatus && trackerState === 'saved' ? ` · ${trackerStatus}. ` : ''}
                <Link to="/tracker">Open tracker</Link>
              </>
            )}
          </p>
          {generateHint && (
            <p id="generate-hint" className="field__hint">
              {generateHint}
            </p>
          )}
          {copyState === 'failed' && (
            <InlineAlert tone="warning">
              <p>Couldn’t copy automatically. The body text is selected — copy it, and the subject, manually.</p>
            </InlineAlert>
          )}
          {downloadFailed && (
            <InlineAlert tone="warning">
              <p>The download didn’t start. Copy the text instead.</p>
            </InlineAlert>
          )}
        </div>
      )}
      <p className="editor__footer">Review before sending. This app does not send emails.</p>
    </section>
  )
}
