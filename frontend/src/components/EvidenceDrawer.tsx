import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { citationNumbers, FIT_LABEL, formatDateTime } from '../lib/format'
import { schoolName, type Candidate, type Experience } from '../types/api'
import { Citations } from './Citations'
import { RecruitmentBadge } from './RecruitmentBadge'
import { SourceLink } from './SourceLink'

function formatPageDate(value: string | null): string {
  if (!value) return 'Not shown on page'
  return value
}

interface EvidenceDrawerProps {
  candidate: Candidate | null
  experiences: Experience[]
  openedSourceIds: string[]
  onClose: () => void
  onPrepare: (candidate: Candidate) => void
  onSourceOpen: (sourceId: string) => void
}

export function EvidenceDrawer({ candidate, experiences, openedSourceIds, onClose, onPrepare, onSourceOpen }: EvidenceDrawerProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [reviewed, setReviewed] = useState(false)
  const [shownId, setShownId] = useState<string | null>(null)

  // Each time a different match opens, the review checkbox starts unchecked.
  if ((candidate?.id ?? null) !== shownId) {
    setShownId(candidate?.id ?? null)
    setReviewed(false)
  }

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (candidate && !dialog.open) {
      dialog.showModal()
      closeRef.current?.focus()
    } else if (!candidate && dialog.open) {
      dialog.close()
    }
  }, [candidate])

  const numbers = candidate ? citationNumbers(candidate) : new Map<string, number>()
  const titleFor = (id: string) => experiences.find((exp) => exp.id === id)?.title

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="drawer-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      {candidate && (
        <div className="drawer__frame">
          <div className="drawer__bar">
            <p className="drawer__eyebrow">Review match</p>
            <button ref={closeRef} type="button" className="icon-button" aria-label="Close review" onClick={onClose}>
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <div className="drawer__content">
            <p className="match__meta">
              {schoolName(candidate.schoolId)}
              {candidate.lab && candidate.lab !== candidate.name ? ` · ${candidate.lab}` : ''}
            </p>
            <h2 id="drawer-title" className="drawer__title">
              {candidate.name}
              {candidate.entityType === 'lab' && <span className="tag">Lab</span>}
              {candidate.mode === 'demo' && <span className="tag tag--sample">Sample</span>}
            </h2>
            <p>{candidate.researchSummary}</p>

            <section className="drawer__section">
              <h3 className="drawer__heading">Why this may fit</h3>
              <p className="drawer__fit">{FIT_LABEL[candidate.fitLevel]}</p>
              <ul className="drawer__list">
                {candidate.fitReasons.map((reason) => {
                  const linked = reason.experienceIds.map(titleFor).filter(Boolean)
                  return (
                    <li key={reason.text}>
                      <p>
                        {reason.text}
                        <Citations ids={reason.sourceIds} numbers={numbers} />
                      </p>
                      {linked.length > 0 && <p className="drawer__aside">Your experience: {linked.join('; ')}</p>}
                      {reason.interestTerms.length > 0 && (
                        <p className="drawer__aside">Your interests: {reason.interestTerms.join(', ')}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="drawer__section">
              <h3 className="drawer__heading">Recruitment status</h3>
              <div className="match__recruitment">
                <RecruitmentBadge status={candidate.recruitment} />
                <span className="match__recruitment-text">
                  {candidate.recruitmentExplanation}
                  <Citations ids={candidate.recruitmentSourceIds} numbers={numbers} />
                </span>
              </div>
              <p className="drawer__aside">A research match does not confirm an open position.</p>
            </section>

            {candidate.unknowns.length > 0 && (
              <section className="drawer__section">
                <h3 className="drawer__heading">Still to confirm</h3>
                <ul className="drawer__list drawer__list--bullets">
                  {candidate.unknowns.map((unknown) => (
                    <li key={unknown}>{unknown}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="drawer__section">
              <h3 className="drawer__heading">Sources</h3>
              <p className="drawer__aside">
                Summaries are paraphrased. Sources show where information came from; they were not checked word by word.
              </p>
              <ol className="drawer__sources">
                {candidate.sources.map((source) => (
                  <li key={source.id} className="drawer__source">
                    <SourceLink
                      source={source}
                      number={numbers.get(source.id) ?? 0}
                      opened={openedSourceIds.includes(source.id)}
                      onOpen={onSourceOpen}
                    />
                    {source.summary && <p className="drawer__source-summary">{source.summary}</p>}
                    <dl className="drawer__dates">
                      <div>
                        <dt>Retrieved</dt>
                        <dd>{formatDateTime(source.retrievedAt)}</dd>
                      </div>
                      <div>
                        <dt>Page date</dt>
                        <dd>{formatPageDate(source.publishedAt)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ol>
            </section>

            <section className="drawer__section drawer__confirm">
              <label className="check-row check-row--plain">
                <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
                <span>I reviewed the match and understand that availability may be unconfirmed.</span>
              </label>
              <div className="drawer__actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!reviewed}
                  aria-describedby={!reviewed ? 'prepare-reason' : undefined}
                  onClick={() => onPrepare(candidate)}
                >
                  Prepare outreach
                </button>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Close
                </button>
              </div>
              {!reviewed && (
                <p id="prepare-reason" className="field__hint">
                  Check the box above to continue.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </dialog>
  )
}
