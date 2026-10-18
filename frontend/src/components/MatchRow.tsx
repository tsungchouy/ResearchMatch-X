import type { MouseEvent } from 'react'
import { citationNumbers, FIT_LABEL } from '../lib/format'
import { schoolName, type Candidate } from '../types/api'
import { Citations } from './Citations'
import { RecruitmentBadge } from './RecruitmentBadge'

interface MatchRowProps {
  candidate: Candidate
  dismissed: boolean
  onReview: (candidate: Candidate, trigger: HTMLElement) => void
  onDismiss: (id: string) => void
  onRestore: (id: string) => void
}

export function MatchRow({ candidate, dismissed, onReview, onDismiss, onRestore }: MatchRowProps) {
  const numbers = citationNumbers(candidate)
  const headingId = `match-${candidate.id}`

  if (dismissed) {
    return (
      <li className="match match--dismissed">
        <p>
          <span className="match__dismissed-name">{candidate.name}</span> marked as not relevant.
        </p>
        <button type="button" className="btn-text" onClick={() => onRestore(candidate.id)}>
          Undo
        </button>
      </li>
    )
  }

  return (
    <li className="match" aria-labelledby={headingId}>
      <p className="match__meta">
        {schoolName(candidate.schoolId)}
        {candidate.lab && candidate.lab !== candidate.name ? ` · ${candidate.lab}` : ''}
      </p>
      <h3 id={headingId} className="match__name">
        {candidate.name}
        {candidate.entityType === 'lab' && <span className="tag">Lab</span>}
        {candidate.mode === 'demo' && <span className="tag tag--sample">Sample</span>}
      </h3>
      <p className="match__summary">{candidate.researchSummary}</p>

      <div className="match__block">
        <h4 className="match__label">
          Why this may fit <span className="match__fit">· {FIT_LABEL[candidate.fitLevel]}</span>
        </h4>
        <ul className="match__reasons">
          {candidate.fitReasons.slice(0, 2).map((reason) => (
            <li key={reason.text}>
              {reason.text}
              <Citations ids={reason.sourceIds} numbers={numbers} />
            </li>
          ))}
        </ul>
      </div>

      <div className="match__recruitment">
        <RecruitmentBadge status={candidate.recruitment} />
        <span className="match__recruitment-text">
          {candidate.recruitmentExplanation}
          <Citations ids={candidate.recruitmentSourceIds} numbers={numbers} />
        </span>
      </div>

      <div className="match__actions">
        <button
          type="button"
          className="btn btn-secondary"
          aria-describedby={headingId}
          onClick={(event: MouseEvent<HTMLButtonElement>) => onReview(candidate, event.currentTarget)}
        >
          Review match
        </button>
        <button type="button" className="btn-text" aria-describedby={headingId} onClick={() => onDismiss(candidate.id)}>
          Not relevant
        </button>
      </div>
    </li>
  )
}
