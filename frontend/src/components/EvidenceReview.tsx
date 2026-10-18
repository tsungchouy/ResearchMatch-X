import { useId, useRef, useState } from 'react'
import { citationNumbers, FIT_LABEL, formatDateTime } from '../lib/format'
import { schoolName, type Candidate, type Experience } from '../types/api'
import { Citations } from './Citations'
import { RecruitmentBadge } from './RecruitmentBadge'
import { SourceLink } from './SourceLink'

export interface EvidenceReviewProps {
  candidate: Candidate
  experiences: Experience[]
  openedSourceIds: string[]
  onPrepare: (candidate: Candidate) => void
  onSourceOpen: (sourceId: string) => void
  headingId: string
}

/** The same evidence and review gate are used in the desktop inspector and mobile dialog. */
export function EvidenceReview({ candidate, experiences, openedSourceIds, onPrepare, onSourceOpen, headingId }: EvidenceReviewProps) {
  const id = useId()
  const [tab, setTab] = useState<'overview' | 'sources'>('overview')
  const [activeSource, setActiveSource] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const sourceNodes = useRef(new Map<string, HTMLLIElement>())
  const overviewTab = useRef<HTMLButtonElement>(null)
  const sourcesTab = useRef<HTMLButtonElement>(null)
  const numbers = citationNumbers(candidate)

  function inspectSource(sourceId: string) {
    setTab('sources')
    setActiveSource(sourceId)
    requestAnimationFrame(() => sourceNodes.current.get(sourceId)?.focus({ preventScroll: false }))
  }

  return (
    <>
      <header className="evidence__header">
        <p className="match__meta">{schoolName(candidate.schoolId)}{candidate.mode === 'demo' ? ' · Sample' : ''}</p>
        <h2 id={headingId} tabIndex={-1} className="drawer__title">{candidate.name}</h2>
        {candidate.lab && candidate.lab !== candidate.name && <p className="evidence__lab">{candidate.lab}</p>}
      </header>
      <div className="tabs evidence__tabs" role="tablist" aria-label="Match information" onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 'overview' : event.key === 'End' ? 'sources' : tab === 'overview' ? 'sources' : 'overview'
        setTab(next)
        const target = next === 'overview' ? overviewTab : sourcesTab
        target.current?.focus()
      }}>
        <button ref={overviewTab} id={`${id}-overview-tab`} type="button" role="tab" className={`tab${tab === 'overview' ? ' is-active' : ''}`} aria-controls={`${id}-overview`} aria-selected={tab === 'overview'} tabIndex={tab === 'overview' ? 0 : -1} onClick={() => setTab('overview')}>Overview</button>
        <button ref={sourcesTab} id={`${id}-sources-tab`} type="button" role="tab" className={`tab${tab === 'sources' ? ' is-active' : ''}`} aria-controls={`${id}-sources`} aria-selected={tab === 'sources'} tabIndex={tab === 'sources' ? 0 : -1} onClick={() => setTab('sources')}>Sources <span className="evidence__count">{candidate.sources.length}</span></button>
      </div>
      <div id={`${id}-overview`} role="tabpanel" aria-labelledby={`${id}-overview-tab`} hidden={tab !== 'overview'}>
        <p className="evidence__summary">{candidate.researchSummary}</p>
        <section className="evidence__section" aria-label="Research alignment">
          <div className="evidence__section-heading"><h3>Why this may fit</h3><span className="match__fit">{FIT_LABEL[candidate.fitLevel]}</span></div>
          <ul className="evidence__reasons">
            {candidate.fitReasons.map((reason) => {
              const linked = reason.experienceIds.map((expId) => experiences.find((exp) => exp.id === expId)?.title).filter(Boolean)
              return (
                <li key={reason.text}>
                  <p className="evidence__background">{linked.length ? linked.join('; ') : reason.interestTerms.join(', ')}</p>
                  <p>{reason.text} <Citations ids={reason.sourceIds} numbers={numbers} onSelect={inspectSource} /></p>
                </li>
              )
            })}
          </ul>
        </section>
        <section className="evidence__section">
          <div className="evidence__section-heading"><h3>Recruitment status</h3><RecruitmentBadge status={candidate.recruitment} /></div>
          <details className="disclosure"><summary>What this means</summary>
            <p>{candidate.recruitmentExplanation} <Citations ids={candidate.recruitmentSourceIds} numbers={numbers} onSelect={inspectSource} /></p>
            <p>A research match does not confirm an open position.</p>
          </details>
          {candidate.unknowns.length > 0 && <details className="disclosure"><summary>Still to confirm</summary><ul>{candidate.unknowns.map((unknown) => <li key={unknown}>{unknown}</li>)}</ul></details>}
        </section>
      </div>
      <div id={`${id}-sources`} role="tabpanel" aria-labelledby={`${id}-sources-tab`} hidden={tab !== 'sources'}>
        <p className="drawer__aside">AI summaries are paraphrases, not verified quotations.</p>
        <ol className="drawer__sources">
          {candidate.sources.map((source) => (
            <li key={source.id} ref={(node) => { if (node) sourceNodes.current.set(source.id, node); else sourceNodes.current.delete(source.id) }} tabIndex={-1} className={`drawer__source${activeSource === source.id ? ' is-active' : ''}`}>
              <SourceLink source={source} number={numbers.get(source.id) ?? 0} opened={openedSourceIds.includes(source.id)} onOpen={onSourceOpen} detailed />
              {source.summary && <p className="drawer__source-summary">{source.summary}</p>}
              <dl className="drawer__dates"><div><dt>Retrieved</dt><dd>{formatDateTime(source.retrievedAt)}</dd></div><div><dt>Page date</dt><dd>{source.publishedAt || 'Not shown on page'}</dd></div></dl>
            </li>
          ))}
        </ol>
      </div>
      <footer className="evidence__footer">
        {!confirming ? <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>Prepare outreach</button> : (
          <div className="evidence__confirm">
            <p className="drawer__aside">Review the fit and recruitment status before continuing.</p>
            <label className="check-row"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /><span>I reviewed the match and understand that availability may be unconfirmed.</span></label>
            <div className="evidence__actions"><button type="button" className="btn btn-primary" disabled={!reviewed} onClick={() => onPrepare(candidate)}>Continue to draft</button><button type="button" className="btn-text" onClick={() => setConfirming(false)}>Back</button></div>
          </div>
        )}
      </footer>
    </>
  )
}
