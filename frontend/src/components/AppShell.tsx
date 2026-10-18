import { useEffect, useRef, useState } from 'react'
import { Inbox, Orbit } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useApp } from '../state/context'
import { useTracker } from '../state/trackerContext'
import { ConfirmDialog } from './ConfirmDialog'
import { InlineAlert } from './InlineAlert'
import { StepNavigation } from './StepNavigation'

export function AppShell() {
  const { state, dispatch, resetSession } = useApp()
  const { records } = useTracker()
  const location = useLocation()
  const navigate = useNavigate()
  const [confirmingReset, setConfirmingReset] = useState(false)
  const routeNotice = (location.state as { notice?: string } | null)?.notice ?? null
  const notice = routeNotice ?? state.notice

  const hasWork = Boolean(state.profileDraft || state.resume.file || state.resume.text.trim())

  // History state survives reloads, so move redirect notices into app state right away.
  // Notices belong to the page they were shown on and clear when the path changes.
  const lastPath = useRef(location.pathname)
  useEffect(() => {
    const pathChanged = lastPath.current !== location.pathname
    lastPath.current = location.pathname
    if (routeNotice) {
      dispatch({ type: 'SET_NOTICE', notice: routeNotice })
      navigate(location.pathname, { replace: true, state: null })
    } else if (pathChanged) {
      dispatch({ type: 'SET_NOTICE', notice: null })
    }
  }, [routeNotice, location.pathname, navigate, dispatch])

  function startOver() {
    setConfirmingReset(false)
    resetSession('live')
    navigate('/profile', { replace: true })
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/profile" className="brand">
            <span className="brand__mark"><Orbit size={20} aria-hidden="true" /></span>
            ResearchMatch
          </Link>
          <div className="site-header__meta">
            <span className={`mode-tag mode-tag--${state.mode}`}>{state.mode === 'demo' ? 'Demo · Sample data' : 'Live'}</span>
            <button
              type="button"
              className="btn-text"
              onClick={() => (hasWork ? setConfirmingReset(true) : startOver())}
            >
              Start over
            </button>
          </div>
        </div>
      </header>
      <div className="container workspace">
        <aside className="workspace__navigation" aria-label="Workspace navigation">
          <StepNavigation />
          <NavLink to="/tracker" className="tracker-link">
            <Inbox size={18} aria-hidden="true" />
            Tracker
            {records.length > 0 && (
              <span className="tracker-link__count">
                {records.length}
                <span className="visually-hidden"> saved</span>
              </span>
            )}
          </NavLink>
        </aside>
        <main id="main" className="main">
          {notice && (
            <div className="page-notice">
              <InlineAlert
                tone="info"
                live
                actions={
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => dispatch({ type: 'SET_NOTICE', notice: null })}
                  >
                    Dismiss
                  </button>
                }
              >
                {notice}
              </InlineAlert>
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <ConfirmDialog
        open={confirmingReset}
        title="Start over?"
        confirmLabel="Start over"
        cancelLabel="Keep working"
        onConfirm={startOver}
        onCancel={() => setConfirmingReset(false)}
      >
        <p>Your profile, matches and any draft in this session will be cleared. Emails you saved to the outreach tracker stay in this browser.</p>
      </ConfirmDialog>
    </div>
  )
}
