import type { ReactNode } from 'react'

interface InlineAlertProps {
  tone?: 'info' | 'warning' | 'error'
  title?: string
  children?: ReactNode
  actions?: ReactNode
  id?: string
  live?: boolean
}

const TONE_LABEL = { info: 'Note', warning: 'Warning', error: 'Error' } as const

export function InlineAlert({ tone = 'info', title, children, actions, id, live = false }: InlineAlertProps) {
  return (
    <div
      className={`inline-alert inline-alert--${tone}`}
      id={id}
      role={tone === 'error' ? 'alert' : live ? 'status' : undefined}
    >
      <span className="visually-hidden">{TONE_LABEL[tone]}: </span>
      {title && <p className="inline-alert__title">{title}</p>}
      {children && <div className="inline-alert__body">{children}</div>}
      {actions && <div className="inline-alert__actions">{actions}</div>}
    </div>
  )
}
