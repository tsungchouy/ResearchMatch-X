import { useEffect, useRef } from 'react'

/** Moves focus to the page H1 when a page mounts, so screen readers announce the new page. */
export function usePageHeading(title: string) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    document.title = `${title} · ResearchMatch`
    ref.current?.focus({ preventScroll: false })
  }, [title])
  return ref
}
