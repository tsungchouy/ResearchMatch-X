import { useState } from 'react'
import { Link } from 'react-router'
import { usePageHeading } from '../app/usePageHeading'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { InlineAlert } from '../components/InlineAlert'
import { useToast } from '../components/Toast'
import { TrackerItem } from '../components/TrackerItem'
import { useApp } from '../state/context'
import { followUpDue, STATUS_LABEL, STATUSES, toCsv, todayIso, type OutreachRecord, type OutreachStatus } from '../state/tracker'
import { useTracker } from '../state/trackerContext'
import { schoolName } from '../types/api'

export function TrackerPage() {
  const { state } = useApp()
  const { records, persisted, update, remove, clear } = useTracker()
  const headingRef = usePageHeading('Outreach tracker')
  const toast = useToast()
  const [filter, setFilter] = useState<OutreachStatus | 'all'>('all')
  const [removing, setRemoving] = useState<OutreachRecord | null>(null)
  const [clearing, setClearing] = useState(false)
  const [downloadFailed, setDownloadFailed] = useState(false)
  const today = todayIso()

  const visible = filter === 'all' ? records : records.filter((record) => record.status === filter)
  const dueCount = records.filter((record) => followUpDue(record, today)).length
  const countOf = (status: OutreachStatus) => records.filter((record) => record.status === status).length

  function downloadCsv() {
    try {
      const blob = new Blob([toCsv(records, schoolName)], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const fileName = `researchmatch-outreach-${today}.csv`
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDownloadFailed(false)
      toast(`Downloaded ${fileName}`)
    } catch {
      setDownloadFailed(true)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 ref={headingRef} tabIndex={-1} className="page-title">
          Outreach tracker
        </h1>
        <p className="page-subtitle">
          Keep track of who you’ve contacted. Saved in this browser only — nothing is uploaded or sent.
        </p>
      </header>

      {!persisted && (
        <InlineAlert tone="warning" title="Changes aren’t being saved.">
          <p>This browser didn’t allow saving. Your records will be lost when you close the tab. Download a CSV to keep a copy.</p>
        </InlineAlert>
      )}

      {records.length === 0 ? (
        <div className="empty-state">
          <h2 className="empty-state__title">Nothing tracked yet.</h2>
          <p>When a draft is ready, choose “Save to tracker” to keep the email here and follow up on it.</p>
          <Link className="btn btn-secondary" to={state.selection ? '/outreach' : '/profile'}>
            {state.selection ? 'Back to outreach' : 'Go to profile'}
          </Link>
        </div>
      ) : (
        <>
          <div className="tracker-toolbar">
            <p className="tracker-toolbar__summary">
              {records.length} {records.length === 1 ? 'record' : 'records'}
              {dueCount > 0 && ` · ${dueCount} follow-up${dueCount === 1 ? '' : 's'} due`}
            </p>
            <div className="field tracker-toolbar__filter">
              <label className="field__label" htmlFor="tracker-filter">
                Show
              </label>
              <select
                id="tracker-filter"
                className="select"
                value={filter}
                onChange={(event) => setFilter(event.target.value as OutreachStatus | 'all')}
              >
                <option value="all">All ({records.length})</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL[status]} ({countOf(status)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="empty-state">
              <h2 className="empty-state__title">No records with this status.</h2>
              <button type="button" className="btn btn-secondary" onClick={() => setFilter('all')}>
                Show all
              </button>
            </div>
          ) : (
            <ul className="tracker-list">
              {visible.map((record) => (
                <TrackerItem key={record.id} record={record} today={today} onUpdate={update} onRemove={setRemoving} />
              ))}
            </ul>
          )}

          <div className="action-row tracker-footer">
            <button type="button" className="btn btn-secondary" onClick={downloadCsv}>
              Download CSV
            </button>
            <button type="button" className="btn-text btn-text--danger" onClick={() => setClearing(true)}>
              Clear tracker
            </button>
          </div>
          {downloadFailed && (
            <InlineAlert tone="warning">
              <p>The download didn’t start. Try again, or copy each email instead.</p>
            </InlineAlert>
          )}
        </>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this record?"
        confirmLabel="Remove"
        cancelLabel="Keep it"
        onConfirm={() => {
          if (removing) {
            remove(removing.id)
            toast(`Removed ${removing.name}`)
          }
          setRemoving(null)
          // The opener is gone, so give focus a stable place.
          requestAnimationFrame(() => headingRef.current?.focus())
        }}
        onCancel={() => setRemoving(null)}
      >
        <p>{removing?.name} and the saved email will be removed from this browser. This can’t be undone.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={clearing}
        title="Clear your tracker?"
        confirmLabel="Clear tracker"
        cancelLabel="Keep records"
        onConfirm={() => {
          clear()
          setClearing(false)
          setFilter('all')
          requestAnimationFrame(() => headingRef.current?.focus())
        }}
        onCancel={() => setClearing(false)}
      >
        <p>
          All {records.length} {records.length === 1 ? 'record' : 'records'} and saved emails will be removed from this browser. This
          can’t be undone.
        </p>
      </ConfirmDialog>
    </div>
  )
}
