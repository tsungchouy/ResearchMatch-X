import { ExternalLink } from 'lucide-react'
import type { Source } from '../types/api'

interface SourceLinkProps {
  source: Source
  number: number
  opened?: boolean
  onOpen?: (sourceId: string) => void
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function SourceLink({ source, number, opened, onOpen }: SourceLinkProps) {
  if (!source.url) {
    return (
      <span className="source">
        <span className="source__title">
          [{number}] {source.title}
        </span>
        <span className="source__meta">Sample source — not a live university page</span>
      </span>
    )
  }
  const domain = source.domain || hostnameOf(source.url)
  return (
    <span className="source">
      <a
        className="source__link"
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onOpen?.(source.id)}
      >
        [{number}] {source.title || domain}
        <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" className="source__icon" />
        <span className="visually-hidden"> (opens in new tab)</span>
      </a>
      <span className="source__meta">
        {domain}
        {opened ? ' · Opened' : ''}
      </span>
    </span>
  )
}
