import { Compass, Mail, UserRound } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useApp } from '../state/context'

export function StepNavigation() {
  const { state, dispatch } = useApp()
  const { pathname } = useLocation()
  const steps = [
    { path: '/profile', label: 'Profile', icon: UserRound, unlocked: true, hint: '' },
    { path: '/matches', label: 'Matches', icon: Compass, unlocked: Boolean(state.confirmedProfile && state.search), hint: 'Review your profile and start a search to see matches.' },
    { path: '/outreach', label: 'Outreach', icon: Mail, unlocked: Boolean(state.selection), hint: 'Review a match before preparing outreach.' },
  ]

  return (
    <nav className="steps" aria-label="Progress">
      <ol className="steps__list">
        {steps.map(({ path, label, icon: Icon, unlocked, hint }) => (
          <li key={path} className="steps__item">
            {unlocked ? (
              <Link to={path} className={`steps__button${pathname === path ? ' is-current' : ''}`} aria-current={pathname === path ? 'page' : undefined}>
                <Icon size={18} aria-hidden="true" />{label}
              </Link>
            ) : (
              <button type="button" className="steps__button" aria-disabled="true" onClick={() => dispatch({ type: 'SET_NOTICE', notice: hint })}>
                <Icon size={18} aria-hidden="true" />{label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
