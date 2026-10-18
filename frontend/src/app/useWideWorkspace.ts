import { useEffect, useState } from 'react'

const QUERY = '(min-width: 1100px)'

/** Keep the inline inspector and mobile dialog mutually exclusive. */
export function useWideWorkspace() {
  const [wide, setWide] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const update = () => setWide(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return wide
}
