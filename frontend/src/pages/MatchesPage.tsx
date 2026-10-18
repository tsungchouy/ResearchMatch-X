import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { usePageHeading } from '../app/usePageHeading'
import { useWideWorkspace } from '../app/useWideWorkspace'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EvidenceDrawer } from '../components/EvidenceDrawer'
import { EvidenceReview } from '../components/EvidenceReview'
import { InlineAlert } from '../components/InlineAlert'
import { MatchRow } from '../components/MatchRow'
import { joinList, RECRUITMENT_LABEL } from '../lib/format'
import { createRequestKey, toErrorBody } from '../services/client'
import { useApp } from '../state/context'
import { isTerminal } from '../state/reducer'
import { schoolName, type ApiErrorBody, type Candidate, type Recruitment, type SchoolId, type SearchJob } from '../types/api'

const SHORT_NAME: Record<SchoolId, string> = { cmu: 'Carnegie Mellon', stanford: 'Stanford', uw: 'University of Washington' }
const SCHOOL_STATUS_LABEL = { pending: 'Pending', searching: 'Searching', complete: 'Complete', failed: 'Failed' } as const

export function MatchesPage() {
  const { state, dispatch, service, resetSession } = useApp()
  const navigate = useNavigate()
  const search = state.search!
  const profile = state.confirmedProfile!
  const job = search.job
  const displayed: SearchJob | null = isTerminal(job) ? job : search.previousJob
  const running = !isTerminal(job) && !search.error
  const showProgress = running && !displayed

  const title = showProgress || (search.error && !displayed) ? 'Finding relevant research.' : 'Research matches'
  const headingRef = usePageHeading(title)
  const wide = useWideWorkspace()
  const [inspectedId, setInspectedId] = useState<string | null>(null)

  const [reviewing, setReviewing] = useState<Candidate | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const [pendingCandidate, setPendingCandidate] = useState<Candidate | null>(null)
  const [actionError, setActionError] = useState<ApiErrorBody | null>(null)
  const [busy, setBusy] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const searchedSchools = (job ?? displayed)?.schools ?? profile.preferences.schools.map((schoolId) => ({
    schoolId,
    name: schoolName(schoolId),
    status: 'pending' as const,
  }))

  const candidates = useMemo(() => displayed?.candidates ?? [], [displayed])
  const filtered = useMemo(
    () =>
      candidates.filter(
        (cand) =>
          (state.filters.school === 'all' || cand.schoolId === state.filters.school) &&
          (state.filters.recruitment === 'all' || cand.recruitment === state.filters.recruitment),
      ),
    [candidates, state.filters],
  )

  const failedSchools = (displayed?.schools ?? []).filter((school) => school.status === 'failed')
  const filtersActive = state.filters.school !== 'all' || state.filters.recruitment !== 'all'
  const inspected = filtered.find((candidate) => candidate.id === inspectedId && !state.dismissedIds.includes(candidate.id))
    ?? filtered.find((candidate) => !state.dismissedIds.includes(candidate.id))

  function closeDrawer() {
    setReviewing(null)
    const target = trigger.current
    if (target) requestAnimationFrame(() => target.focus())
  }

  function prepare(candidate: Candidate) {
    if (state.draft.edited && state.selection && state.selection.candidateId !== candidate.id) {
      setPendingCandidate(candidate)
      return
    }
    select(candidate)
  }

  function select(candidate: Candidate) {
    if (!displayed) return
    setPendingCandidate(null)
    setReviewing(null)
    dispatch({ type: 'SELECT_CANDIDATE', candidateId: candidate.id, jobId: displayed.id })
    navigate('/outreach')
  }

  async function cancel() {
    setBusy(true)
    setActionError(null)
    try {
      const updated = await service.cancelSearch(search.jobId)
      dispatch({ type: 'SEARCH_UPDATED', jobId: search.jobId, job: updated })
    } catch (error) {
      setActionError(toErrorBody(error))
    } finally {
      setBusy(false)
    }
  }

  async function retryFailed() {
    if (!displayed) return
    setBusy(true)
    setActionError(null)
    try {
      const ids = failedSchools.map((school) => school.schoolId)
      const { jobId } = await service.retrySearch(displayed.id, ids, createRequestKey())
      dispatch({ type: 'SEARCH_STARTED', jobId, profileId: profile.id, profileVersion: profile.version, mode: state.mode, retry: true })
    } catch (error) {
      setActionError(toErrorBody(error))
    } finally {
      setBusy(false)
    }
  }

  async function searchAgain() {
    setBusy(true)
    setActionError(null)
    try {
      const { jobId } = await service.startSearch(profile, createRequestKey())
      dispatch({ type: 'SEARCH_STARTED', jobId, profileId: profile.id, profileVersion: profile.version, mode: state.mode })
    } catch (error) {
      setActionError(toErrorBody(error))
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <header className="page-header">
      <h1 ref={headingRef} tabIndex={-1} className="page-title">
        {title}
      </h1>
      {!showProgress && <p className="page-subtitle">{profile.preferences.interests.join(' · ')}</p>}
    </header>
  )

  if (search.error && !displayed) {
    const gone = search.error.code === 'JOB_NOT_FOUND'
    return (
      <div className="page">
        {header}
        <InlineAlert
          tone="error"
          title={gone ? 'This search is no longer available.' : 'We lost contact with the search.'}
          actions={
            gone ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  resetSession(state.mode, state.demoPreset ?? undefined)
                  navigate('/profile')
                }}
              >
                Start over
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => dispatch({ type: 'SEARCH_RESUME_POLLING', jobId: search.jobId })}
              >
                Check again
              </button>
            )
          }
        >
          <p>{gone ? 'The server may have restarted. Your session data is not kept.' : search.error.message}</p>
        </InlineAlert>
      </div>
    )
  }

  if (showProgress) {
    const current = job?.currentSchoolId
    return (
      <div className="page">
        {header}
        <div className="progress" aria-busy="true">
          <ol className="progress__list">
            {searchedSchools.map((school) => (
              <li key={school.schoolId} className={`progress__item progress__item--${school.status}`}>
                <span className="progress__school">{school.name}</span>
                <span className="progress__status">{SCHOOL_STATUS_LABEL[school.status]}</span>
              </li>
            ))}
          </ol>
          <p className="progress__stage" aria-live="polite">
            {job?.status === 'organizing'
              ? 'Organizing sources and matches…'
              : current
                ? `Searching ${schoolName(current)}…`
                : 'Starting search…'}
          </p>
          <div className="skeleton" aria-hidden="true">
            <span className="skeleton__line" />
            <span className="skeleton__line skeleton__line--short" />
            <span className="skeleton__line" />
          </div>
          {actionError && (
            <InlineAlert tone="error">
              <p>{actionError.message}</p>
            </InlineAlert>
          )}
          <button type="button" className="btn btn-secondary" onClick={cancel} disabled={busy}>
            Cancel search
          </button>
        </div>
      </div>
    )
  }

  if (job?.status === 'cancelled' && !search.previousJob) {
    return (
      <div className="page">
        {header}
        <div className="empty-state">
          <h2 className="empty-state__title">Search cancelled.</h2>
          <p>No results were kept from this search.</p>
          <div className="action-row">
            <button type="button" className="btn btn-primary" onClick={searchAgain} disabled={busy}>
              Search again
            </button>
            <Link to="/profile" className="text-link">
              Edit preferences
            </Link>
          </div>
          {actionError && (
            <InlineAlert tone="error">
              <p>{actionError.message}</p>
            </InlineAlert>
          )}
        </div>
      </div>
    )
  }

  const schoolOptions: SchoolId[] = (displayed?.schools ?? []).map((school) => school.schoolId)

  return (
    <div className="page">
      {header}
      <div className="matches-layout">
        <aside className="summary" aria-label="Search summary and filters">
          <Link to="/profile" className="text-link edit-profile-link">
            Edit profile
          </Link>

          <div className={`filters${filtersOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="btn btn-secondary filters__toggle"
              aria-expanded={filtersOpen}
              aria-controls="filters-panel"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              Filters{filtersActive ? ' · On' : ''}
            </button>
            <div id="filters-panel" className="filters__panel">
              <h2 className="filters__title">Filter</h2>
              <div className="field">
                <label className="field__label" htmlFor="filter-school">
                  University
                </label>
                <select
                  id="filter-school"
                  className="select"
                  value={state.filters.school}
                  onChange={(event) => dispatch({ type: 'SET_FILTER', school: event.target.value as SchoolId | 'all' })}
                >
                  <option value="all">All universities</option>
                  {schoolOptions.map((id) => (
                    <option key={id} value={id}>
                      {schoolName(id)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="filter-recruitment">
                  Recruitment status
                </label>
                <select
                  id="filter-recruitment"
                  className="select"
                  value={state.filters.recruitment}
                  onChange={(event) => dispatch({ type: 'SET_FILTER', recruitment: event.target.value as Recruitment | 'all' })}
                >
                  <option value="all">All statuses</option>
                  {(Object.keys(RECRUITMENT_LABEL) as Recruitment[]).map((status) => (
                    <option key={status} value={status}>
                      {RECRUITMENT_LABEL[status]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </aside>

        <section className="results" aria-labelledby="results-count">
          <div className="results__header">
            <h2 id="results-count" className="results__count">
              {candidates.length === 1 ? '1 match' : `${candidates.length} matches`}
            </h2>
            {displayed?.mode === 'demo' && (
              <p className="results__note">Sample data: these people, labs and sources are fictional, not live university pages.</p>
            )}
          </div>

          {running && search.previousJob && (
            <InlineAlert tone="info" live>
              <p>
                Retrying{' '}
                {joinList((job?.schools ?? search.previousJob.schools).filter((s) => s.status !== 'complete').map((s) => s.name))}
                …
              </p>
            </InlineAlert>
          )}

          {search.error && displayed && (
            <InlineAlert
              tone="error"
              actions={
                <button type="button" className="btn-text" onClick={() => dispatch({ type: 'SEARCH_RESUME_POLLING', jobId: search.jobId })}>
                  Check again
                </button>
              }
            >
              <p>{search.error.message}</p>
            </InlineAlert>
          )}

          {!running && failedSchools.length > 0 && displayed && displayed.status !== 'failed' && (
            <InlineAlert
              tone="warning"
              actions={
                <button type="button" className="btn btn-secondary" onClick={retryFailed} disabled={busy}>
                  {failedSchools.length === 1 ? 'Retry failed school' : 'Retry failed schools'}
                </button>
              }
            >
              <p>
                Results from {displayed.schools.length - failedSchools.length} of {displayed.schools.length} universities.{' '}
                {joinList(failedSchools.map((s) => SHORT_NAME[s.schoolId]))} could not be searched.
              </p>
            </InlineAlert>
          )}

          {actionError && (
            <InlineAlert tone="error">
              <p>{actionError.message}</p>
            </InlineAlert>
          )}

          {displayed?.status === 'failed' ? (
            <div className="empty-state">
              <h3 className="empty-state__title">We couldn’t search these universities.</h3>
              <ul className="plain-list">
                {failedSchools.map((school) => (
                  <li key={school.schoolId}>
                    {school.name}: {school.errorMessage ?? 'Search failed.'}
                  </li>
                ))}
              </ul>
              <div className="action-row">
                <button type="button" className="btn btn-primary" onClick={retryFailed} disabled={busy || running}>
                  Try again
                </button>
                <Link to="/profile" className="text-link">
                  Edit preferences
                </Link>
              </div>
            </div>
          ) : candidates.length === 0 ? (
            <div className="empty-state">
              <h3 className="empty-state__title">No supported matches found.</h3>
              <p>Try a broader research interest or another university.</p>
              <Link to="/profile" className="btn btn-secondary">
                Edit preferences
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <h3 className="empty-state__title">No matches for these filters.</h3>
              <p>{candidates.length} matches are hidden by the current filters.</p>
              <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'CLEAR_FILTERS' })}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className="results__body">
            <ol className="match-list" aria-label="Research matches">
              {filtered.map((candidate) => (
                <MatchRow
                  key={candidate.id}
                  candidate={candidate}
                  dismissed={state.dismissedIds.includes(candidate.id)}
                  selected={wide && inspected?.id === candidate.id}
                  onReview={(cand, element) => {
                    trigger.current = element
                    setInspectedId(cand.id)
                    if (wide) requestAnimationFrame(() => document.getElementById('evidence-title')?.focus())
                    else setReviewing(cand)
                  }}
                  onDismiss={(id) => dispatch({ type: 'DISMISS_CANDIDATE', candidateId: id })}
                  onRestore={(id) => dispatch({ type: 'RESTORE_CANDIDATE', candidateId: id })}
                />
              ))}
            </ol>
            {wide && inspected && <section className="evidence-panel" aria-label="Review match"><EvidenceReview key={inspected.id} candidate={inspected} headingId="evidence-title" experiences={profile.experiences} openedSourceIds={state.openedSourceIds} onPrepare={prepare} onSourceOpen={(sourceId) => dispatch({ type: 'SOURCE_OPENED', sourceId })} /></section>}
            </div>
          )}
          {displayed && displayed.warnings.length > 0 && (
            <p className="results__warnings">{displayed.warnings.join(' ')}</p>
          )}
        </section>
      </div>

      {!wide && <EvidenceDrawer
        candidate={reviewing}
        experiences={profile.experiences}
        openedSourceIds={state.openedSourceIds}
        onClose={closeDrawer}
        onPrepare={prepare}
        onSourceOpen={(sourceId) => dispatch({ type: 'SOURCE_OPENED', sourceId })}
      />}
      <ConfirmDialog
        open={Boolean(pendingCandidate)}
        title="Replace your edited draft?"
        confirmLabel="Discard draft and continue"
        cancelLabel="Keep my draft"
        onConfirm={() => pendingCandidate && select(pendingCandidate)}
        onCancel={() => setPendingCandidate(null)}
      >
        <p>You edited an email for another match. Download or copy it first if you want to keep it.</p>
      </ConfirmDialog>
    </div>
  )
}
