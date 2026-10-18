import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Candidate } from '../types/api'
import { EvidenceReview, type EvidenceReviewProps } from './EvidenceReview'

interface EvidenceDrawerProps extends Omit<EvidenceReviewProps, 'candidate' | 'headingId'> {
  candidate: Candidate | null
  onClose: () => void
}

export function EvidenceDrawer({ candidate, onClose, ...props }: EvidenceDrawerProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (candidate && !dialog.open) { dialog.showModal(); closeRef.current?.focus() }
    else if (!candidate && dialog.open) dialog.close()
  }, [candidate])

  return (
    <dialog ref={ref} className="drawer" aria-labelledby="drawer-title" onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === ref.current) onClose() }}>
      {candidate && <div className="drawer__frame"><div className="drawer__bar"><p className="drawer__eyebrow">Review match</p><button ref={closeRef} type="button" className="icon-button" aria-label="Close review" onClick={onClose}><X size={20} aria-hidden="true" /></button></div><div className="drawer__content"><EvidenceReview key={candidate.id} candidate={candidate} headingId="drawer-title" {...props} /></div></div>}
    </dialog>
  )
}
