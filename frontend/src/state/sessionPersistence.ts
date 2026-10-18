import type { Profile, SearchJob } from '../types/api'
import { initialState, type AppState } from './reducer'

export const SESSION_STORAGE_KEY = 'researchmatch.session.v1'
const VERSION = 1

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isProfile(value: unknown): value is Profile {
  if (!isObject(value) || !isObject(value.preferences)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.version === 'number' &&
    typeof value.confirmed === 'boolean' &&
    isStringArray(value.skills) &&
    Array.isArray(value.experiences) &&
    value.experiences.every(
      (item) => isObject(item) && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.description === 'string',
    ) &&
    isStringArray(value.preferences.interests) &&
    isStringArray(value.preferences.schools)
  )
}

function isSearchJob(value: unknown): value is SearchJob {
  if (!isObject(value) || !Array.isArray(value.schools) || !Array.isArray(value.candidates)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.status === 'string' &&
    typeof value.profileId === 'string' &&
    typeof value.profileVersion === 'number' &&
    value.candidates.every(
      (candidate) =>
        isObject(candidate) &&
        typeof candidate.id === 'string' &&
        Array.isArray(candidate.fitReasons) &&
        Array.isArray(candidate.unknowns) &&
        Array.isArray(candidate.sources),
    )
  )
}

function isStoredState(value: unknown): value is AppState {
  if (!isObject(value) || !isObject(value.resume) || !isObject(value.outreach) || !isObject(value.draft)) return false
  const profileDraft = value.profileDraft
  const confirmedProfile = value.confirmedProfile
  const search = value.search
  const validSearch =
    search === null ||
    (isObject(search) &&
      typeof search.jobId === 'string' &&
      typeof search.profileId === 'string' &&
      typeof search.profileVersion === 'number' &&
      (search.job === null || isSearchJob(search.job)) &&
      (search.previousJob === null || isSearchJob(search.previousJob)))
  return (
    typeof value.sessionId === 'string' &&
    /^[A-Za-z0-9_-]{32,128}$/.test(value.sessionId) &&
    (value.mode === 'live' || value.mode === 'demo') &&
    (profileDraft === null || isProfile(profileDraft)) &&
    (confirmedProfile === null || isProfile(confirmedProfile)) &&
    validSearch &&
    (value.resume.tab === 'pdf' || value.resume.tab === 'text') &&
    typeof value.resume.text === 'string' &&
    isStringArray(value.dismissedIds) &&
    isStringArray(value.openedSourceIds) &&
    isStringArray(value.outreach.selectedExperienceIds) &&
    typeof value.outreach.userRequest === 'string' &&
    typeof value.outreach.signatureName === 'string' &&
    typeof value.outreach.availability === 'string' &&
    typeof value.draft.subject === 'string' &&
    typeof value.draft.body === 'string'
  )
}

export function loadSession(): AppState | null {
  if (typeof window === 'undefined') return null
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null')
    if (!isObject(parsed) || parsed.version !== VERSION || !isStoredState(parsed.state)) return null
    const stored = parsed.state
    const fresh = initialState(stored.sessionId)
    return {
      ...stored,
      health: fresh.health,
      resume: { ...stored.resume, file: null },
      extraction: fresh.extraction,
      search: stored.search ? { ...stored.search, error: null } : null,
      draft: { ...stored.draft, status: 'idle', error: null, requestKey: null },
      notice: null,
    }
  } catch {
    return null
  }
}

export function saveSession(state: AppState): void {
  if (typeof window === 'undefined') return
  try {
    const hasWork = Boolean(state.profileDraft || state.resume.text.trim() || state.search || state.draft.email || state.mode === 'demo')
    if (!hasWork) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
      return
    }
    const stored: AppState = {
      ...state,
      resume: { ...state.resume, file: null },
      extraction: { status: 'idle', error: null, token: null },
      search: state.search ? { ...state.search, error: null } : null,
      draft: { ...state.draft, status: 'idle', error: null, requestKey: null },
      notice: null,
    }
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: VERSION, state: stored }))
  } catch {
    // The app remains usable when browser storage is unavailable or full.
  }
}
