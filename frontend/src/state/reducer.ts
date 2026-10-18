import type { PresetId } from '../fixtures/demo'
import type { ApiErrorBody, EmailDraft, Profile, Recruitment, SchoolId, SearchJob } from '../types/api'
import { TERMINAL_STATUSES } from '../types/api'

export type AppMode = 'live' | 'demo'

export interface SearchState {
  jobId: string
  profileId: string
  profileVersion: number
  mode: AppMode
  job: SearchJob | null
  /** Results from the job this one retries, shown until the retry reports back. */
  previousJob: SearchJob | null
  error: ApiErrorBody | null
}

export interface OutreachInputs {
  selectedExperienceIds: string[]
  educationOnly: boolean
  userRequest: string
  signatureName: string
  availability: string
  onlySelectedConfirmed: boolean
}

export interface DraftState {
  email: EmailDraft | null
  subject: string
  body: string
  edited: boolean
  stale: boolean
  status: 'idle' | 'loading' | 'error'
  error: ApiErrorBody | null
  requestKey: string | null
}

export interface Selection {
  candidateId: string
  jobId: string
  reviewConfirmed: boolean
}

export interface AppState {
  sessionId: string
  mode: AppMode
  demoPreset: PresetId | null
  health: { checked: boolean; reachable: boolean; liveConfigured: boolean }
  resume: { tab: 'pdf' | 'text'; file: File | null; text: string }
  extraction: { status: 'idle' | 'loading' | 'error'; error: ApiErrorBody | null; token: string | null }
  profileDraft: Profile | null
  confirmedProfile: Profile | null
  reviewChecked: boolean
  profileDirty: boolean
  search: SearchState | null
  dismissedIds: string[]
  filters: { school: SchoolId | 'all'; recruitment: Recruitment | 'all' }
  openedSourceIds: string[]
  selection: Selection | null
  outreach: OutreachInputs
  draft: DraftState
  notice: string | null
}

export const emptyOutreach: OutreachInputs = {
  selectedExperienceIds: [],
  educationOnly: false,
  userRequest: '',
  signatureName: '',
  availability: '',
  onlySelectedConfirmed: false,
}

export const emptyDraft: DraftState = {
  email: null,
  subject: '',
  body: '',
  edited: false,
  stale: false,
  status: 'idle',
  error: null,
  requestKey: null,
}

export function initialState(sessionId: string, notice: string | null = null): AppState {
  return {
    sessionId,
    mode: 'live',
    demoPreset: null,
    health: { checked: false, reachable: false, liveConfigured: false },
    resume: { tab: 'pdf', file: null, text: '' },
    extraction: { status: 'idle', error: null, token: null },
    profileDraft: null,
    confirmedProfile: null,
    reviewChecked: false,
    profileDirty: false,
    search: null,
    dismissedIds: [],
    filters: { school: 'all', recruitment: 'all' },
    openedSourceIds: [],
    selection: null,
    outreach: emptyOutreach,
    draft: emptyDraft,
    notice,
  }
}

export type Action =
  | { type: 'HEALTH_LOADED'; reachable: boolean; liveConfigured: boolean }
  | { type: 'RESET_SESSION'; sessionId: string; mode: AppMode; preset?: PresetId; profile?: Profile }
  | { type: 'SET_RESUME_TAB'; tab: 'pdf' | 'text' }
  | { type: 'SET_RESUME_FILE'; file: File | null }
  | { type: 'SET_RESUME_TEXT'; text: string }
  | { type: 'EXTRACT_START'; token: string }
  | { type: 'EXTRACT_SUCCESS'; token: string; profile: Profile }
  | { type: 'EXTRACT_FAILURE'; token: string; error: ApiErrorBody }
  | { type: 'EDIT_PROFILE'; profile: Profile }
  | { type: 'SET_REVIEW_CHECKED'; checked: boolean }
  | { type: 'DISCARD_PROFILE_EDITS' }
  | { type: 'PROFILE_CONFIRMED'; profile: Profile; mode: AppMode }
  | { type: 'SEARCH_STARTED'; jobId: string; profileId: string; profileVersion: number; mode: AppMode; retry?: boolean }
  | { type: 'SEARCH_UPDATED'; jobId: string; job: SearchJob }
  | { type: 'SEARCH_ERROR'; jobId: string; error: ApiErrorBody }
  | { type: 'SEARCH_RESUME_POLLING'; jobId: string }
  | { type: 'SET_FILTER'; school?: SchoolId | 'all'; recruitment?: Recruitment | 'all' }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'DISMISS_CANDIDATE'; candidateId: string }
  | { type: 'RESTORE_CANDIDATE'; candidateId: string }
  | { type: 'SOURCE_OPENED'; sourceId: string }
  | { type: 'SELECT_CANDIDATE'; candidateId: string; jobId: string }
  | { type: 'SET_OUTREACH'; patch: Partial<OutreachInputs> }
  | { type: 'DRAFT_START'; key: string }
  | { type: 'DRAFT_SUCCESS'; key: string; draft: EmailDraft }
  | { type: 'DRAFT_FAILURE'; key: string; error: ApiErrorBody }
  | { type: 'EDIT_DRAFT'; subject?: string; body?: string }
  | { type: 'DISCARD_DRAFT' }
  | { type: 'SET_NOTICE'; notice: string | null }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function formatMonth(value: string | null): string | null {
  if (!value) return null
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return null
  return `${MONTHS[month - 1]} ${year}`
}

export function availabilityText(profile: Profile | null): string {
  if (!profile) return ''
  const start = formatMonth(profile.preferences.startMonth)
  const end = formatMonth(profile.preferences.endMonth)
  if (start && end) return `from ${start} to ${end}`
  if (start) return `starting ${start}`
  if (end) return `until ${end}`
  return ''
}

function outreachDefaults(profile: Profile | null): OutreachInputs {
  return { ...emptyOutreach, signatureName: profile?.name ?? '', availability: availabilityText(profile) }
}

/** Everything that depends on the confirmed profile or on a particular search. */
function clearDownstream(state: AppState): AppState {
  return {
    ...state,
    search: null,
    dismissedIds: [],
    filters: { school: 'all', recruitment: 'all' },
    openedSourceIds: [],
    selection: null,
    outreach: emptyOutreach,
    draft: emptyDraft,
  }
}

export function isTerminal(job: SearchJob | null): boolean {
  return Boolean(job && TERMINAL_STATUSES.includes(job.status))
}

export function hasDownstreamWork(state: AppState): boolean {
  return Boolean(state.search || state.selection || state.draft.email)
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HEALTH_LOADED':
      return { ...state, health: { checked: true, reachable: action.reachable, liveConfigured: action.liveConfigured } }

    case 'RESET_SESSION': {
      const fresh = initialState(action.sessionId)
      return {
        ...fresh,
        health: state.health,
        mode: action.mode,
        demoPreset: action.preset ?? null,
        profileDraft: action.profile ?? null,
        profileDirty: Boolean(action.profile),
      }
    }

    case 'SET_RESUME_TAB':
      return { ...state, resume: { ...state.resume, tab: action.tab }, extraction: { ...state.extraction, error: null } }
    case 'SET_RESUME_FILE':
      return { ...state, resume: { ...state.resume, file: action.file }, extraction: { ...state.extraction, error: null } }
    case 'SET_RESUME_TEXT':
      return { ...state, resume: { ...state.resume, text: action.text } }

    case 'EXTRACT_START':
      return { ...state, extraction: { status: 'loading', error: null, token: action.token } }
    case 'EXTRACT_SUCCESS': {
      if (state.extraction.token !== action.token) return state
      const keepPreferences = state.profileDraft?.preferences
      const profile = keepPreferences ? { ...action.profile, preferences: keepPreferences } : action.profile
      return {
        ...state,
        extraction: { status: 'idle', error: null, token: null },
        profileDraft: profile,
        profileDirty: true,
        reviewChecked: false,
      }
    }
    case 'EXTRACT_FAILURE':
      if (state.extraction.token !== action.token) return state
      return { ...state, extraction: { status: 'error', error: action.error, token: null } }

    case 'EDIT_PROFILE':
      return { ...state, profileDraft: action.profile, profileDirty: true, reviewChecked: false }
    case 'SET_REVIEW_CHECKED':
      return { ...state, reviewChecked: action.checked }
    case 'DISCARD_PROFILE_EDITS':
      if (!state.confirmedProfile) return state
      return { ...state, profileDraft: structuredClone(state.confirmedProfile), profileDirty: false, reviewChecked: true }

    case 'PROFILE_CONFIRMED': {
      if (action.mode !== state.mode) return state
      const base = state.confirmedProfile?.version === action.profile.version ? state : clearDownstream(state)
      return { ...base, confirmedProfile: action.profile, profileDraft: structuredClone(action.profile), profileDirty: false }
    }

    case 'SEARCH_STARTED': {
      if (action.mode !== state.mode || action.profileVersion !== state.confirmedProfile?.version) return state
      const previous = action.retry ? (state.search?.job ?? state.search?.previousJob ?? null) : null
      const base = action.retry ? state : { ...clearDownstream(state), confirmedProfile: state.confirmedProfile }
      return {
        ...base,
        search: {
          jobId: action.jobId,
          profileId: action.profileId,
          profileVersion: action.profileVersion,
          mode: action.mode,
          job: null,
          previousJob: previous,
          error: null,
        },
      }
    }
    case 'SEARCH_UPDATED': {
      const search = state.search
      if (!search || search.jobId !== action.jobId) return state
      if (action.job.profileVersion !== state.confirmedProfile?.version || action.job.mode !== state.mode) return state
      return { ...state, search: { ...search, job: action.job, previousJob: isTerminal(action.job) ? null : search.previousJob } }
    }
    case 'SEARCH_ERROR': {
      const search = state.search
      if (!search || search.jobId !== action.jobId) return state
      return { ...state, search: { ...search, error: action.error } }
    }
    case 'SEARCH_RESUME_POLLING': {
      const search = state.search
      if (!search || search.jobId !== action.jobId) return state
      return { ...state, search: { ...search, error: null } }
    }

    case 'SET_FILTER':
      return {
        ...state,
        filters: {
          school: action.school ?? state.filters.school,
          recruitment: action.recruitment ?? state.filters.recruitment,
        },
      }
    case 'CLEAR_FILTERS':
      return { ...state, filters: { school: 'all', recruitment: 'all' } }
    case 'DISMISS_CANDIDATE':
      return state.dismissedIds.includes(action.candidateId)
        ? state
        : { ...state, dismissedIds: [...state.dismissedIds, action.candidateId] }
    case 'RESTORE_CANDIDATE':
      return { ...state, dismissedIds: state.dismissedIds.filter((id) => id !== action.candidateId) }
    case 'SOURCE_OPENED':
      return state.openedSourceIds.includes(action.sourceId)
        ? state
        : { ...state, openedSourceIds: [...state.openedSourceIds, action.sourceId] }

    case 'SELECT_CANDIDATE': {
      const same = state.selection?.candidateId === action.candidateId
      return {
        ...state,
        selection: { candidateId: action.candidateId, jobId: action.jobId, reviewConfirmed: true },
        outreach: same ? state.outreach : outreachDefaults(state.confirmedProfile),
        draft: same ? state.draft : emptyDraft,
      }
    }

    case 'SET_OUTREACH': {
      const outreach = { ...state.outreach, ...action.patch }
      if (action.patch.educationOnly) outreach.selectedExperienceIds = []
      if (action.patch.selectedExperienceIds?.length) outreach.educationOnly = false
      const changesContent = Object.keys(action.patch).some((key) => key !== 'onlySelectedConfirmed')
      return {
        ...state,
        outreach,
        draft: state.draft.email && changesContent ? { ...state.draft, stale: true } : state.draft,
      }
    }

    case 'DRAFT_START':
      return { ...state, draft: { ...state.draft, status: 'loading', error: null, requestKey: action.key } }
    case 'DRAFT_SUCCESS': {
      if (state.draft.requestKey !== action.key) return state
      if (action.draft.profileVersion !== state.confirmedProfile?.version) return state
      if (action.draft.candidateId !== state.selection?.candidateId) return state
      return {
        ...state,
        draft: {
          email: action.draft,
          subject: action.draft.subject,
          body: action.draft.body,
          edited: false,
          stale: false,
          status: 'idle',
          error: null,
          requestKey: null,
        },
      }
    }
    case 'DRAFT_FAILURE':
      if (state.draft.requestKey !== action.key) return state
      return { ...state, draft: { ...state.draft, status: 'error', error: action.error, requestKey: null } }
    case 'EDIT_DRAFT':
      return {
        ...state,
        draft: {
          ...state.draft,
          subject: action.subject ?? state.draft.subject,
          body: action.body ?? state.draft.body,
          edited: true,
        },
      }
    case 'DISCARD_DRAFT':
      return { ...state, draft: emptyDraft }

    case 'SET_NOTICE':
      return { ...state, notice: action.notice }

    default:
      return state
  }
}
