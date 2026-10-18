import { Navigate } from 'react-router'
import { MatchesPage } from '../pages/MatchesPage'
import { OutreachPage } from '../pages/OutreachPage'
import { useApp } from '../state/context'

export function RequireMatches() {
  const { state } = useApp()
  if (!state.confirmedProfile || !state.search) {
    return <Navigate to="/profile" replace state={{ notice: 'Confirm your profile and start a search to see matches.' }} />
  }
  return <MatchesPage />
}

export function RequireOutreach() {
  const { state } = useApp()
  const selection = state.selection
  const jobs = [state.search?.job, state.search?.previousJob].filter(Boolean)
  const candidate = selection
    ? jobs.find((job) => job!.id === selection.jobId)?.candidates.find((cand) => cand.id === selection.candidateId)
    : undefined
  if (!state.confirmedProfile || !selection || !candidate) {
    const hasMatches = Boolean(state.confirmedProfile && state.search)
    return (
      <Navigate
        to={hasMatches ? '/matches' : '/profile'}
        replace
        state={{
          notice: hasMatches
            ? 'Review a match and choose Prepare outreach first.'
            : 'Confirm your profile and choose a match before preparing outreach.',
        }}
      />
    )
  }
  return <OutreachPage key={candidate.id} candidate={candidate} />
}
