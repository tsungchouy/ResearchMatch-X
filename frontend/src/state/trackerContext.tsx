import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Candidate } from '../types/api'
import {
  parseRecords,
  removeRecord,
  saveDraft as saveDraftPure,
  STORAGE_KEY,
  updateRecord,
  type OutreachRecord,
  type RecordPatch,
} from './tracker'

interface TrackerContextValue {
  records: OutreachRecord[]
  /** False when the browser refused to store the last change (private mode, quota, disabled storage). */
  persisted: boolean
  saveDraft: (candidate: Candidate, email: { subject: string; body: string }) => 'created' | 'updated'
  update: (id: string, patch: RecordPatch) => void
  remove: (id: string) => void
  clear: () => void
}

const TrackerContext = createContext<TrackerContextValue | null>(null)

function readStorage(): OutreachRecord[] {
  try {
    return parseRecords(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

function writeStorage(records: OutreachRecord[]): boolean {
  try {
    if (records.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    return true
  } catch {
    return false
  }
}

/** Outreach records live only in this browser's localStorage, separate from the in-memory session. */
export function TrackerProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<OutreachRecord[]>(readStorage)
  const [persisted, setPersisted] = useState(true)
  const recordsRef = useRef(records)

  const commit = useCallback((next: OutreachRecord[]) => {
    recordsRef.current = next
    setRecords(next)
    setPersisted(writeStorage(next))
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return
      const next = readStorage()
      recordsRef.current = next
      setRecords(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const saveDraft = useCallback<TrackerContextValue['saveDraft']>(
    (candidate, email) => {
      const result = saveDraftPure(recordsRef.current, candidate, email, new Date().toISOString())
      commit(result.records)
      return result.created ? 'created' : 'updated'
    },
    [commit],
  )

  const update = useCallback(
    (id: string, patch: RecordPatch) => commit(updateRecord(recordsRef.current, id, patch, new Date().toISOString())),
    [commit],
  )
  const remove = useCallback((id: string) => commit(removeRecord(recordsRef.current, id)), [commit])
  const clear = useCallback(() => commit([]), [commit])

  const value = useMemo(
    () => ({ records, persisted, saveDraft, update, remove, clear }),
    [records, persisted, saveDraft, update, remove, clear],
  )
  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useTracker(): TrackerContextValue {
  const value = useContext(TrackerContext)
  if (!value) throw new Error('useTracker must be used inside TrackerProvider')
  return value
}
