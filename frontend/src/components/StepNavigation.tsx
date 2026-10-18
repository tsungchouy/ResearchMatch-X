import { useLocation, useNavigate } from 'react-router'
import { useApp } from '../state/context'

interface Step {
  path: string
  number: string
  label: string
  unlocked: boolean
  reason: string
}

export function StepNavigation() {
  const { state } = useApp()
  const location = useLocation()
  const navigate = useNavigate()

  const steps: Step[] = [
    { path: '/profile', number: '01', label: 'Profile', unlocked: true, reason: '' },
    {
      path: '/matches',
      number: '02',
      label: 'Matches',
      unlocked: Boolean(state.confirmedProfile && state.search),
      reason: 'After profile',
    },
    {
      path: '/outreach',
      number: '03',
      label: 'Outreach',
      unlocked: Boolean(state.selection),
      reason: 'After choosing a match',
    },
  ]

  return (
    <nav className="steps" aria-label="Progress">
      <ol className="steps__list">
        {steps.map((step) => {
          const current = location.pathname === step.path
          const reasonId = `step-reason-${step.number}`
          return (
            <li key={step.path} className="steps__item">
              <button
                type="button"
                className={`steps__button${current ? ' is-current' : ''}`}
                aria-current={current ? 'step' : undefined}
                aria-disabled={!step.unlocked || undefined}
                aria-describedby={!step.unlocked ? reasonId : undefined}
                onClick={() => {
                  if (step.unlocked && !current) navigate(step.path)
                }}
              >
                <span className="steps__number">{step.number}</span> {step.label}
              </button>
              {!step.unlocked && (
                <span id={reasonId} className="steps__reason">
                  {step.reason}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
