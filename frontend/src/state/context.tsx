import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react'
import { presetProfile, type PresetId } from '../fixtures/demo'
import { ApiError, createSessionId, fetchHealth, toErrorBody, type Service } from '../services/client'
import { createDemoService } from '../services/demo'
import { createLiveService } from '../services/live'
import { initialState, isTerminal, reducer, type Action, type AppMode, type AppState } from './reducer'

const SESSION_FLAG = 'researchmatch.activeSession'
const POLL_MS = 1500
const MAX_POLL_FAILURES = 3

interface AppContextValue {
  state: AppState
  dispatch: Dispatch<Action>
  service: Service
  resetSession: (mode: AppMode, preset?: PresetId) => void
}

const AppContext = createContext<AppContextValue | null>(null)

// Read once per page load: StrictMode runs reducer initializers twice.
let refreshNotice: string | null | undefined

function readRefreshNotice(): string | null {
  if (refreshNotice !== undefined) return refreshNotice
  refreshNotice = null
  try {
    if (sessionStorage.getItem(SESSION_FLAG)) {
      sessionStorage.removeItem(SESSION_FLAG)
      refreshNotice = 'Your previous session wasn’t saved, so its profile and matches are gone. Start again below.'
    }
  } catch {
    // Storage can be unavailable (private mode); the notice is optional.
  }
  return refreshNotice
}

export function AppProvider({ children, initial }: { children: ReactNode; initial?: AppState }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initial ?? initialState(createSessionId(), readRefreshNotice()))

  const service = useMemo<Service>(
    () => (state.mode === 'demo' && state.demoPreset ? createDemoService(state.demoPreset) : createLiveService(state.sessionId)),
    [state.mode, state.demoPreset, state.sessionId],
  )

  useEffect(() => {
    let active = true
    fetchHealth().then((health) => {
      if (active) dispatch({ type: 'HEALTH_LOADED', ...health })
    })
    return () => {
      active = false
    }
  }, [])

  // Only a boolean marker is stored, never resume content.
  const hasSession = Boolean(state.profileDraft)
  useEffect(() => {
    try {
      if (hasSession) sessionStorage.setItem(SESSION_FLAG, '1')
      else sessionStorage.removeItem(SESSION_FLAG)
    } catch {
      // ignore
    }
  }, [hasSession])

  const jobId = state.search?.jobId ?? null
  const shouldPoll = Boolean(state.search && !state.search.error && !isTerminal(state.search.job))
  const failures = useRef(0)
  useEffect(() => {
    if (!jobId || !shouldPoll) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    failures.current = 0
    const tick = async () => {
      try {
        const job = await service.getSearch(jobId)
        if (cancelled) return
        failures.current = 0
        dispatch({ type: 'SEARCH_UPDATED', jobId, job })
        if (isTerminal(job)) return
      } catch (error) {
        if (cancelled) return
        failures.current += 1
        const notFound = error instanceof ApiError && error.status === 404
        if (notFound || failures.current >= MAX_POLL_FAILURES) {
          dispatch({ type: 'SEARCH_ERROR', jobId, error: toErrorBody(error) })
          return
        }
      }
      timer = setTimeout(tick, POLL_MS)
    }
    timer = setTimeout(tick, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [jobId, shouldPoll, service])

  const resetSession = useCallback((mode: AppMode, preset?: PresetId) => {
    const sessionId = createSessionId()
    const profile = mode === 'demo' && preset ? presetProfile(preset, `demo-prof-${sessionId.slice(0, 8)}`) : undefined
    dispatch({ type: 'RESET_SESSION', sessionId, mode, preset, profile })
  }, [])

  const value = useMemo(() => ({ state, dispatch, service, resetSession }), [state, service, resetSession])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}
