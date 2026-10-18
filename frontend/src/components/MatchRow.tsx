import { ArrowUpRight } from 'lucide-react'
import { FIT_LABEL } from '../lib/format'
import { schoolName, type Candidate } from '../types/api'
import { RecruitmentBadge } from './RecruitmentBadge'

interface MatchRowProps {
  candidate: Candidate
  dismissed: boolean
  selected: boolean
  onReview: (candidate: Candidate, trigger: HTMLElement) => void
  onDismiss: (id: string) => void
  onRestore: (id: string) => void
}

export function MatchRow({ candidate, dismissed, selected, onReview, onDismiss, onRestore }: MatchRowProps) {
  const headingId = `match-${candidate.id}`
  if (dismissed) return <li className="match match--dismissed"><p><span className="match__dismissed-name">{candidate.name}</span> marked as not relevant.</p><button type="button" className="btn-text" onClick={() => onRestore(candidate.id)}>Undo</button></li>

  return (
    <li className={`match${selected ? ' is-selected' : ''}`} aria-labelledby={headingId}>
      <p className="match__meta">{schoolName(candidate.schoolId)}{candidate.mode === 'demo' ? ' · Sample' : ''}</p>
      <h3 id={headingId} className="match__name">{candidate.name}</h3>
      {candidate.lab && candidate.lab !== candidate.name && <p className="match__lab">{candidate.lab}</p>}
      <p className="match__summary">{candidate.researchSummary}</p>
      <div className="match__status"><span className="match__fit">{FIT_LABEL[candidate.fitLevel]}</span><RecruitmentBadge status={candidate.recruitment} /></div>
      <div className="match__actions"><button type="button" className="btn-text" aria-describedby={headingId} aria-pressed={selected} onClick={(event) => onReview(candidate, event.currentTarget)}>Review match <ArrowUpRight size={16} aria-hidden="true" /></button><button type="button" className="btn-text match__dismiss" aria-describedby={headingId} onClick={() => onDismiss(candidate.id)}>Not relevant</button></div>
    </li>
  )
}
