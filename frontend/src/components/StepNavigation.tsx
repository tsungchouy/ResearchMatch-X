import { useLocation, useNavigate } from 'react-router'
import { useApp } from '../state/context'

interface Step {
  path: string
  label: string
  unlocked: boolean
}

export function StepNavigation() {
  const { state } = useApp()
  const location = useLocation()
  const navigate = useNavigate()

  const steps: Step[] = [
    { path: '/profile', label: 'Profile', unlocked: true },
    {
      path: '/matches',
      label: 'Matches',
      unlocked: Boolean(state.confirmedProfile && state.search),
    },
    {
      path: '/outreach',
      label: 'Outreach',
      unlocked: Boolean(state.selection),
    },
  ]

  return (
    <nav className="steps" aria-label="Progress">
      <ol className="steps__list">
        {steps.map((step) => {
          const current = location.pathname === step.path
          return (
            <li key={step.path} className="steps__item">
              <button
                type="button"
                className={`steps__button${current ? ' is-current' : ''}`}
                aria-current={current ? 'step' : undefined}
                aria-disabled={!step.unlocked || undefined}
                onClick={() => {
                  if (step.unlocked && !current) navigate(step.path)
                }}
              >
                {step.label}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
