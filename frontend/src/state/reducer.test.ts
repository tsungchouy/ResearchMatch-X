import { describe, expect, it } from 'vitest'
import { presetProfile, sampleCandidates } from '../fixtures/demo'
import type { EmailDraft, Profile, SearchJob } from '../types/api'
import { initialState, reducer, type Action, type AppState } from './reducer'

function run(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reducer, state)
}

function confirmed(version = 1): Profile {
  return { ...presetProfile('hci', 'prof-1'), version, confirmed: true }
}

function job(id: string, profileVersion = 1, status: SearchJob['status'] = 'complete'): SearchJob {
  return {
    id,
    status,
    profileId: 'prof-1',
    profileVersion,
    schools: [{ schoolId: 'cmu', name: 'Carnegie Mellon University', status: 'complete', errorCode: null, errorMessage: null }],
    currentSchoolId: null,
    candidates: sampleCandidates('hci', ['cmu'], ['demo-exp-hci-1'], '2026-10-17T00:00:00Z').map((c) => ({ ...c, mode: 'live' })),
    warnings: [],
    createdAt: '2026-10-17T00:00:00Z',
    retrievedAt: '2026-10-17T00:00:00Z',
    retryOf: null,
    mode: 'live',
  }
}

function draft(candidateId: string, profileVersion = 1): EmailDraft {
  return { id: 'd1', candidateId, profileVersion, subject: 'Hi', body: 'Body text', createdAt: '2026-10-17T00:00:00Z', mode: 'live' }
}

/** A live session that has searched, selected a match and generated a draft. */
function withDraft(): AppState {
  const base = run(
    initialState('session-a'),
    { type: 'PROFILE_CONFIRMED', profile: confirmed(1), mode: 'live' },
    { type: 'SEARCH_STARTED', jobId: 'job-1', profileId: 'prof-1', profileVersion: 1, mode: 'live' },
  )
  const result = job('job-1')
  const candidateId = result.candidates[0].id
  return run(
    base,
    { type: 'SEARCH_UPDATED', jobId: 'job-1', job: result },
    { type: 'SELECT_CANDIDATE', candidateId, jobId: 'job-1' },
    { type: 'SET_OUTREACH', patch: { selectedExperienceIds: ['demo-exp-hci-1'], onlySelectedConfirmed: true } },
    { type: 'DRAFT_START', key: 'k1' },
    { type: 'DRAFT_SUCCESS', key: 'k1', draft: draft(candidateId) },
  )
}

describe('profile change invalidation', () => {
  it('editing the profile unchecks the review box and marks it dirty without clearing results', () => {
    const state = run(withDraft(), { type: 'SET_REVIEW_CHECKED', checked: true })
    const edited = run(state, { type: 'EDIT_PROFILE', profile: { ...state.profileDraft!, name: 'Changed' } })
    expect(edited.reviewChecked).toBe(false)
    expect(edited.profileDirty).toBe(true)
    expect(edited.confirmedProfile?.name).toBe('Jordan Sample')
    expect(edited.search).not.toBeNull()
    expect(edited.draft.email).not.toBeNull()
  })

  it('confirming a new version clears search, selection, outreach and draft', () => {
    const next = run(withDraft(), { type: 'PROFILE_CONFIRMED', profile: confirmed(2), mode: 'live' })
    expect(next.confirmedProfile?.version).toBe(2)
    expect(next.search).toBeNull()
    expect(next.selection).toBeNull()
    expect(next.draft.email).toBeNull()
    expect(next.outreach.selectedExperienceIds).toEqual([])
  })

  it('discarding edits restores the confirmed profile', () => {
    const state = withDraft()
    const edited = run(state, { type: 'EDIT_PROFILE', profile: { ...state.profileDraft!, major: 'Other' } })
    const restored = run(edited, { type: 'DISCARD_PROFILE_EDITS' })
    expect(restored.profileDraft?.major).toBe('Human-Computer Interaction')
    expect(restored.profileDirty).toBe(false)
  })
})

describe('late responses', () => {
  it('ignores updates for a job that is no longer current', () => {
    const state = run(withDraft(), {
      type: 'SEARCH_STARTED',
      jobId: 'job-2',
      profileId: 'prof-1',
      profileVersion: 1,
      mode: 'live',
    })
    const late = run(state, { type: 'SEARCH_UPDATED', jobId: 'job-1', job: job('job-1') })
    expect(late.search?.jobId).toBe('job-2')
    expect(late.search?.job).toBeNull()
  })

  it('ignores a job result for an older profile version', () => {
    const state = run(
      initialState('s'),
      { type: 'PROFILE_CONFIRMED', profile: confirmed(2), mode: 'live' },
      { type: 'SEARCH_STARTED', jobId: 'job-1', profileId: 'prof-1', profileVersion: 2, mode: 'live' },
    )
    const stale = run(state, { type: 'SEARCH_UPDATED', jobId: 'job-1', job: job('job-1', 1) })
    expect(stale.search?.job).toBeNull()
  })

  it('ignores a draft whose request key, candidate or profile version no longer matches', () => {
    const state = withDraft()
    const candidateId = state.selection!.candidateId
    const pending = run(state, { type: 'DRAFT_START', key: 'k2' })
    expect(run(pending, { type: 'DRAFT_SUCCESS', key: 'k1', draft: draft(candidateId) }).draft.requestKey).toBe('k2')
    expect(run(pending, { type: 'DRAFT_SUCCESS', key: 'k2', draft: draft('other') }).draft.status).toBe('loading')
    expect(run(pending, { type: 'DRAFT_SUCCESS', key: 'k2', draft: draft(candidateId, 9) }).draft.status).toBe('loading')
  })

  it('ignores an extraction that was superseded', () => {
    const state = run(initialState('s'), { type: 'EXTRACT_START', token: 'a' }, { type: 'EXTRACT_START', token: 'b' })
    const late = run(state, { type: 'EXTRACT_SUCCESS', token: 'a', profile: presetProfile('ml', 'p') })
    expect(late.profileDraft).toBeNull()
  })

  it('ignores a confirmation that arrives after the mode changed', () => {
    const state = run(initialState('s'), { type: 'RESET_SESSION', sessionId: 't', mode: 'demo', preset: 'hci' })
    const late = run(state, { type: 'PROFILE_CONFIRMED', profile: confirmed(1), mode: 'live' })
    expect(late.confirmedProfile).toBeNull()
  })
})

describe('mode switching', () => {
  it('resets the whole session, so demo selections never reach live outreach', () => {
    const state = run(withDraft(), { type: 'HEALTH_LOADED', reachable: true, liveConfigured: true })
    const demo = run(state, {
      type: 'RESET_SESSION',
      sessionId: 'session-b',
      mode: 'demo',
      preset: 'hci',
      profile: presetProfile('hci', 'demo-prof'),
    })
    expect(demo.mode).toBe('demo')
    expect(demo.sessionId).toBe('session-b')
    expect(demo.confirmedProfile).toBeNull()
    expect(demo.search).toBeNull()
    expect(demo.selection).toBeNull()
    expect(demo.draft.email).toBeNull()
    expect(demo.health.liveConfigured).toBe(true)
    expect(demo.profileDraft?.id).toBe('demo-prof')
  })

  it('drops a live search start once the session is in demo mode', () => {
    const state = run(
      initialState('s'),
      { type: 'RESET_SESSION', sessionId: 't', mode: 'demo', preset: 'hci' },
      { type: 'PROFILE_CONFIRMED', profile: confirmed(1), mode: 'demo' },
    )
    const late = run(state, { type: 'SEARCH_STARTED', jobId: 'j', profileId: 'prof-1', profileVersion: 1, mode: 'live' })
    expect(late.search).toBeNull()
  })
})

describe('draft protection', () => {
  it('marks edits and keeps them when outreach details change', () => {
    const edited = run(withDraft(), { type: 'EDIT_DRAFT', body: 'My own words' })
    expect(edited.draft.edited).toBe(true)
    const changed = run(edited, { type: 'SET_OUTREACH', patch: { availability: 'June 2027' } })
    expect(changed.draft.stale).toBe(true)
    expect(changed.draft.body).toBe('My own words')
  })

  it('keeps the previous draft when regeneration fails', () => {
    const edited = run(withDraft(), { type: 'EDIT_DRAFT', body: 'My own words' }, { type: 'DRAFT_START', key: 'k3' })
    const failed = run(edited, {
      type: 'DRAFT_FAILURE',
      key: 'k3',
      error: { code: 'PROVIDER_ERROR', message: 'Failed', retryable: true },
    })
    expect(failed.draft.body).toBe('My own words')
    expect(failed.draft.edited).toBe(true)
    expect(failed.draft.status).toBe('error')
  })

  it('reselecting the same match keeps the draft; choosing another clears it', () => {
    const state = withDraft()
    const { candidateId, jobId } = state.selection!
    expect(run(state, { type: 'SELECT_CANDIDATE', candidateId, jobId }).draft.email).not.toBeNull()
    const other = state.search!.job!.candidates[1].id
    expect(run(state, { type: 'SELECT_CANDIDATE', candidateId: other, jobId }).draft.email).toBeNull()
  })

  it('education-only and experience selection are mutually exclusive', () => {
    const state = run(withDraft(), { type: 'SET_OUTREACH', patch: { educationOnly: true } })
    expect(state.outreach.selectedExperienceIds).toEqual([])
    const back = run(state, { type: 'SET_OUTREACH', patch: { selectedExperienceIds: ['demo-exp-hci-2'] } })
    expect(back.outreach.educationOnly).toBe(false)
  })
})
